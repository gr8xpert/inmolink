import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "images.inmolink.local" },
      { protocol: "https", hostname: "*.imagedelivery.net" },
    ],
  },
  // PUBLIC marketplace headers — aggressive CDN caching for non-auth pages.
  // Per PLAN.md §11.4: s-maxage=300 + stale-while-revalidate=600.
  async headers() {
    return [
      {
        source: "/:locale(en|es|de|fr)/property/:slug*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      {
        source: "/:locale(en|es|de|fr)/buy/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
