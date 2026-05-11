import { env } from "@/env";
import type { MetadataRoute } from "next";

/**
 * robots.txt — public marketplace allows all; api + Next internals blocked.
 * Sitemap URL points at the worker-generated index served via
 * `apps/public/app/sitemap.xml/route.ts` (PLAN §11.13).
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_PUBLIC_URL;
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
