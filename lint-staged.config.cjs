// Run Biome on staged TS/JS/JSON/CSS/Markdown files. Fast (~10x ESLint+Prettier).
// Per ADR 0001 / PLAN §11.12.

module.exports = {
  "*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,css,md}": [
    "biome check --write --no-errors-on-unmatched",
  ],
  // Validate Prisma schema separately when it changes
  "packages/db/prisma/schema.prisma": [
    () => "pnpm --filter @inmolink/db prisma validate",
    () => "pnpm --filter @inmolink/db prisma format",
  ],
};
