/**
 * Per-segment sitemap proxy. URL shape:
 *   /sitemaps/sitemap-properties-en-0000.xml
 *   /sitemaps/sitemap-locations-en.xml
 *   /sitemaps/sitemap-groups-en.xml
 *
 * Strict allowlist regex on the filename — anything else returns 404
 * without hitting the api. Defense in depth: the api re-validates with
 * the same shape before talking to Storage.
 */

export const revalidate = 3600;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const FILENAME_RE = /^sitemap(-(properties|locations|groups)-(en|es|de|fr)(-\d{4})?)?\.xml$/;

type Params = { params: Promise<{ file: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { file } = await params;
  if (!FILENAME_RE.test(file)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const res = await fetch(`${API_BASE}/api/public/sitemaps/${encodeURIComponent(file)}`, {
      next: { revalidate: 3600, tags: [`sitemap:${file}`] },
    });
    if (!res.ok) {
      return new Response("Not found", { status: 404 });
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
    return new Response("Service unavailable", { status: 503 });
  }
}
