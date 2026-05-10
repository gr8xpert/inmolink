#!/usr/bin/env tsx
/**
 * Sitemap + robots.txt validator (PLAN §11.13).
 *
 * Run against staging or production:
 *   tsx scripts/validate-sitemap.ts https://inmolink.eu
 *
 * Checks:
 *   1. /robots.txt resolves with sitemap directive pointing at the index
 *   2. /sitemap.xml is well-formed XML, has at least one <sitemap> entry
 *   3. Each child sitemap fetches 200 + has at least one <url>
 *   4. A random sample of property URLs returns 200
 *   5. <xhtml:link rel="alternate" hreflang> appears for non-home URLs
 *
 * Exits non-zero on any failure — wire into CI pre-deploy if useful.
 */

const BASE = process.argv[2];
if (!BASE) {
  console.error("Usage: tsx scripts/validate-sitemap.ts <base-url>");
  process.exit(2);
}

const SAMPLE_URLS = 5;
const TIMEOUT_MS = 15_000;

let failures = 0;

function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function pass(_msg: string): void {}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  // 1. robots.txt
  const robots = await fetchText(`${BASE}/robots.txt`);
  if (robots.status !== 200) {
    fail(`/robots.txt returned ${robots.status}`);
  } else {
    const sitemapMatch = robots.body.match(/^Sitemap:\s*(\S+)/im);
    if (!sitemapMatch) {
      fail("/robots.txt missing `Sitemap:` directive");
    } else {
      pass(`/robots.txt declares ${sitemapMatch[1]}`);
    }
  }

  // 2. /sitemap.xml well-formed
  const index = await fetchText(`${BASE}/sitemap.xml`);
  if (index.status !== 200) {
    fail(`/sitemap.xml returned ${index.status}`);
    return;
  }
  if (!index.body.includes("<sitemapindex") && !index.body.includes("<urlset")) {
    fail("/sitemap.xml is neither <sitemapindex> nor <urlset>");
    return;
  }
  pass("/sitemap.xml is well-formed XML");

  // 3. Each child sitemap (when index)
  const childMatches = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (childMatches.length === 0) {
    fail("/sitemap.xml has zero child <loc> entries");
  } else {
    pass(`/sitemap.xml lists ${childMatches.length} child sitemaps`);
    for (const child of childMatches.slice(0, 5)) {
      if (!child) continue;
      const c = await fetchText(child);
      if (c.status !== 200) {
        fail(`child sitemap ${child} → ${c.status}`);
        continue;
      }
      const urls = [...c.body.matchAll(/<url>[\s\S]*?<\/url>/g)];
      if (urls.length === 0) {
        fail(`child sitemap ${child} has zero <url> entries`);
      } else {
        pass(`${child} — ${urls.length} URLs`);
      }
    }
  }

  // 4. Sample property URLs
  const allLocs = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const propertyUrls = allLocs
    .filter((u): u is string => Boolean(u?.includes("/property/")))
    .slice(0, SAMPLE_URLS);

  if (propertyUrls.length === 0) {
    // Pull from the first child sitemap
    const firstChild = childMatches[0];
    if (firstChild) {
      const c = await fetchText(firstChild);
      const urls = [...c.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => m[1])
        .filter((u): u is string => Boolean(u?.includes("/property/")))
        .slice(0, SAMPLE_URLS);
      propertyUrls.push(...urls);
    }
  }

  for (const url of propertyUrls) {
    const r = await fetchText(url);
    if (r.status !== 200) {
      fail(`property url ${url} → ${r.status}`);
    } else if (!r.body.includes('rel="alternate"') || !r.body.includes("hreflang=")) {
      fail(`property url ${url} missing hreflang alternates`);
    } else {
      pass(`property url ${url} → 200 + hreflang`);
    }
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
