import type { MetadataRoute } from "next";

/**
 * robots.txt — public marketplace allows all; api + Next internals blocked.
 * Sitemap URL points at the worker-generated index served via
 * `apps/public/app/sitemap.xml/route.ts` (PLAN §11.13).
 *
 * `NEXT_PUBLIC_PUBLIC_URL` is the canonical public origin (e.g.
 * https://inmolink.es). Default to localhost in dev.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3002";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
