import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Workspace packages publish raw TypeScript; let Next.js transpile them
  // (handles .js → .ts extension mapping for intra-package imports).
  transpilePackages: [
    "@inmolink/auth",
    "@inmolink/db",
    "@inmolink/shared",
    "@inmolink/search",
    "@inmolink/ui",
  ],
  // Native modules with .node bindings must NOT be bundled. Keeps
  // require("@node-rs/argon2") and Prisma's query engine binary as runtime
  // imports instead of letting webpack inline them (which fails).
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client", "prisma"],
  // Belt-and-braces: when @inmolink/auth is in transpilePackages, webpack
  // sometimes follows its imports and tries to bundle argon2 anyway.
  // Explicit externals on the server side guarantees the binary stays out
  // of the bundle.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      externals.push("@node-rs/argon2");
      config.externals = externals;
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "images.inmolink.local" },
      { protocol: "https", hostname: "*.imagedelivery.net" },
    ],
  },
};

export default withNextIntl(nextConfig);
