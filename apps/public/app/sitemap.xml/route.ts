/**
 * `/sitemap.xml` — proxies the worker-generated index from the api's
 * Storage. We don't use Next's MetadataRoute.Sitemap because the worker
 * may emit dozens of segmented files at scale; the index is the canonical
 * entry point that lists them all (PLAN §11.13 + §1 row 47).
 *
 * Cache: 1h on the edge, 5m on the browser. Worker regenerates daily —
 * stale-while-revalidate keeps crawls warm even during regeneration.
 */

import { env } from "@/env";

export const revalidate = 3600;

const API_BASE = env.NEXT_PUBLIC_API_URL;

export async function GET(): Promise<Response> {
  // We can't use publicApiFetch — it parses JSON. Stream the raw XML.
  try {
    const res = await fetch(`${API_BASE}/api/public/sitemaps/sitemap.xml`, {
      next: { revalidate: 3600, tags: ["sitemap"] },
    });
    if (!res.ok) {
      // Bare-minimum empty index so robots.txt isn't pointing at a 500.
      return new Response(emptyIndex(), {
        status: 200,
        headers: { "content-type": "application/xml; charset=utf-8" },
      });
    }
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch {
    // Fall through to empty index if api is unreachable.
    return new Response(emptyIndex(), {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }
}

function emptyIndex(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "</sitemapindex>",
  ].join("\n");
}
