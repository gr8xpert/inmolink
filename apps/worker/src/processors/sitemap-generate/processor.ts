import { prisma } from "@inmolink/db";
import { LOCALES, type Locale } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Job } from "bullmq";
import type { Logger } from "pino";

/**
 * Sitemap-generate processor (PLAN §11.13 + §1 row 47).
 *
 * Daily job — writes per-locale sitemaps to Storage under the `sitemaps/`
 * prefix. apps/public exposes route handlers that fetch + stream them.
 *
 * Output structure (per run, all overwrite):
 *   sitemaps/sitemap.xml                           ← index, lists all below
 *   sitemaps/sitemap-properties-<loc>-NNNN.xml     ← 1+ segments per locale
 *   sitemaps/sitemap-locations-<loc>.xml           ← per-locale (one file)
 *   sitemaps/sitemap-groups-<loc>.xml              ← per-locale
 *
 * Each URL in a property sitemap carries `<xhtml:link rel="alternate" hreflang>`
 * for every other locale's translation (PLAN §11.13 — hreflang). Locations +
 * groups do the same.
 *
 * Segmentation: 50K URL ceiling per file (the sitemap-protocol cap; we use
 * the URL cap not byte cap because property URLs are predictable in size and
 * 50KB×50K = 2.5MB which is well below the 50MB byte cap).
 */

const URL_LIMIT_PER_SEGMENT = 50_000;
const SITEMAP_PREFIX = "sitemaps/";

type Deps = {
  storage: Storage;
  logger: Logger;
  /** Public base URL (`https://inmolink.local`). Loc=URL prefix. */
  publicBaseUrl: string;
};

export type SitemapResult = {
  files: string[];
  urls: number;
};

/** XML-escape per spec (XML 1.0 §2.4). Only the five mandatory entities. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlsetOpen(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ].join("\n");
}
const URLSET_CLOSE = "</urlset>";

type AltLink = { hreflang: string; href: string };
type AltLinks = AltLink[];

function urlEntry(args: { loc: string; lastmod?: string; alternates?: AltLinks }): string {
  const lines = ["  <url>", `    <loc>${xmlEscape(args.loc)}</loc>`];
  if (args.lastmod) lines.push(`    <lastmod>${args.lastmod}</lastmod>`);
  if (args.alternates) {
    for (const alt of args.alternates) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alt.hreflang)}" href="${xmlEscape(alt.href)}"/>`,
      );
    }
  }
  lines.push("  </url>");
  return lines.join("\n");
}

export function makeSitemapGenerateProcessor(deps: Deps) {
  const { storage, logger, publicBaseUrl } = deps;

  return async function processSitemapGenerateJob(job: Job<unknown>): Promise<SitemapResult> {
    const log = logger.child({ jobId: job.id, queue: job.queueName });
    const files: string[] = [];
    let urls = 0;

    const lastmodToday = new Date().toISOString().slice(0, 10);

    type PropertySitemapRow = {
      id: string;
      updatedAt: Date;
      translations: { locale: string; slug: string }[];
    };

    // ── PROPERTIES ────────────────────────────────────────────────────────
    // Cursor-paginated stream — never load 30K rows into memory at once.
    // We iterate in id-order and segment when we hit URL_LIMIT_PER_SEGMENT.
    for (const locale of LOCALES) {
      let segmentIdx = 0;
      let bufferUrls: string[] = [];
      let lastId: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch: PropertySitemapRow[] = await prisma.property.findMany({
          where: {
            visibility: "PUBLIC",
            status: "ACTIVE",
            deletedAt: null,
          },
          select: {
            id: true,
            updatedAt: true,
            translations: { select: { locale: true, slug: true } },
          },
          orderBy: { id: "asc" },
          take: 1000,
          cursor: lastId ? { id: lastId } : undefined,
          skip: lastId ? 1 : 0,
        });
        if (batch.length === 0) break;

        for (const row of batch) {
          // Pick this locale's slug, fall back to en, then any.
          const tr =
            row.translations.find((t) => t.locale === locale) ??
            row.translations.find((t) => t.locale === "en") ??
            row.translations[0];
          if (!tr) continue;

          const lastmod = row.updatedAt.toISOString().slice(0, 10);
          const alternates: AltLinks = [];
          for (const alt of LOCALES) {
            const altTr =
              row.translations.find((t) => t.locale === alt) ??
              row.translations.find((t) => t.locale === "en") ??
              row.translations[0];
            if (!altTr) continue;
            alternates.push({
              hreflang: alt,
              href: `${publicBaseUrl}/${alt}/property/${altTr.slug}-${row.id}`,
            });
          }
          // x-default points to en — Google's recommendation when one is canonical.
          const enTr = row.translations.find((t) => t.locale === "en") ?? tr;
          alternates.push({
            hreflang: "x-default",
            href: `${publicBaseUrl}/en/property/${enTr.slug}-${row.id}`,
          });

          bufferUrls.push(
            urlEntry({
              loc: `${publicBaseUrl}/${locale}/property/${tr.slug}-${row.id}`,
              lastmod,
              alternates,
            }),
          );

          if (bufferUrls.length >= URL_LIMIT_PER_SEGMENT) {
            const filename = `sitemap-properties-${locale}-${String(segmentIdx).padStart(4, "0")}.xml`;
            await writeXml(storage, filename, bufferUrls);
            files.push(filename);
            urls += bufferUrls.length;
            segmentIdx += 1;
            bufferUrls = [];
          }
        }

        const last = batch[batch.length - 1];
        if (!last) break;
        lastId = last.id;
      }

      if (bufferUrls.length > 0) {
        const filename = `sitemap-properties-${locale}-${String(segmentIdx).padStart(4, "0")}.xml`;
        await writeXml(storage, filename, bufferUrls);
        files.push(filename);
        urls += bufferUrls.length;
      }
    }

    // ── LOCATIONS ─────────────────────────────────────────────────────────
    // Locations are bounded (≤ 100K country/region/city/area rows in v1).
    // One file per locale.
    const locationRows = await prisma.location.findMany({
      where: { isActive: true },
      select: {
        id: true,
        updatedAt: true,
        translations: { select: { locale: true, slug: true } },
        // Walk parents for the canonical path.
        parent: {
          select: {
            translations: { select: { locale: true, slug: true } },
            parent: {
              select: {
                translations: { select: { locale: true, slug: true } },
                parent: {
                  select: {
                    translations: { select: { locale: true, slug: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    for (const locale of LOCALES) {
      const buf: string[] = [];
      for (const row of locationRows) {
        const localePath = buildLocationPath(row, locale);
        if (!localePath) continue;
        const alternates: AltLinks = [];
        for (const alt of LOCALES) {
          const altPath = buildLocationPath(row, alt);
          if (!altPath) continue;
          alternates.push({ hreflang: alt, href: `${publicBaseUrl}/${alt}/buy/${altPath}` });
        }
        const enPath = buildLocationPath(row, "en") ?? localePath;
        alternates.push({ hreflang: "x-default", href: `${publicBaseUrl}/en/buy/${enPath}` });
        buf.push(
          urlEntry({
            loc: `${publicBaseUrl}/${locale}/buy/${localePath}`,
            lastmod: row.updatedAt.toISOString().slice(0, 10),
            alternates,
          }),
        );
      }
      if (buf.length > 0) {
        const filename = `sitemap-locations-${locale}.xml`;
        await writeXml(storage, filename, buf);
        files.push(filename);
        urls += buf.length;
      }
    }

    // ── LOCATION GROUPS ───────────────────────────────────────────────────
    const groupRows = await prisma.locationGroup.findMany({
      where: { isActive: true },
      select: {
        id: true,
        updatedAt: true,
        translations: { select: { locale: true, slug: true } },
      },
    });
    for (const locale of LOCALES) {
      const buf: string[] = [];
      for (const row of groupRows) {
        const tr =
          row.translations.find((t) => t.locale === locale) ??
          row.translations.find((t) => t.locale === "en") ??
          row.translations[0];
        if (!tr) continue;
        const alternates: AltLinks = row.translations.map((t) => ({
          hreflang: t.locale,
          href: `${publicBaseUrl}/${t.locale}/region/${t.slug}`,
        }));
        const enTr = row.translations.find((t) => t.locale === "en") ?? tr;
        alternates.push({
          hreflang: "x-default",
          href: `${publicBaseUrl}/en/region/${enTr.slug}`,
        });
        buf.push(
          urlEntry({
            loc: `${publicBaseUrl}/${locale}/region/${tr.slug}`,
            lastmod: row.updatedAt.toISOString().slice(0, 10),
            alternates,
          }),
        );
      }
      if (buf.length > 0) {
        const filename = `sitemap-groups-${locale}.xml`;
        await writeXml(storage, filename, buf);
        files.push(filename);
        urls += buf.length;
      }
    }

    // ── INDEX ─────────────────────────────────────────────────────────────
    // Sub-sitemaps live at `/sitemaps/<file>` per apps/public route handler.
    // The bare `/sitemap.xml` URL is the entry point Google checks first;
    // robots.txt references it explicitly.
    const indexLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...files.map(
        (f) =>
          `  <sitemap>\n    <loc>${xmlEscape(`${publicBaseUrl}/sitemaps/${f}`)}</loc>\n    <lastmod>${lastmodToday}</lastmod>\n  </sitemap>`,
      ),
      "</sitemapindex>",
    ];
    await storage.put(
      `${SITEMAP_PREFIX}sitemap.xml`,
      Buffer.from(indexLines.join("\n"), "utf8"),
      "application/xml",
    );

    log.info({ files: files.length + 1, urls }, "sitemap generated");
    return { files: [...files, "sitemap.xml"], urls };
  };
}

async function writeXml(storage: Storage, filename: string, urlEntries: string[]): Promise<void> {
  const xml = [urlsetOpen(), ...urlEntries, URLSET_CLOSE].join("\n");
  await storage.put(`${SITEMAP_PREFIX}${filename}`, Buffer.from(xml, "utf8"), "application/xml");
}

type LocationWithParents = {
  translations: { locale: string; slug: string }[];
  parent?: {
    translations: { locale: string; slug: string }[];
    parent?: {
      translations: { locale: string; slug: string }[];
      parent?: {
        translations: { locale: string; slug: string }[];
      } | null;
    } | null;
  } | null;
};

function buildLocationPath(row: LocationWithParents, locale: Locale): string | null {
  const chain: string[] = [];
  // Walk up. We unshift each slug so the resulting array is country→...→leaf.
  const own = pickSlug(row.translations, locale);
  if (!own) return null;
  chain.unshift(own);

  let cursor = row.parent;
  while (cursor) {
    const slug = pickSlug(cursor.translations, locale);
    if (!slug) return null;
    chain.unshift(slug);
    cursor = cursor.parent ?? null;
  }
  return chain.join("/");
}

function pickSlug(rows: { locale: string; slug: string }[], locale: Locale): string | null {
  return (
    rows.find((r) => r.locale === locale)?.slug ??
    rows.find((r) => r.locale === "en")?.slug ??
    rows[0]?.slug ??
    null
  );
}
