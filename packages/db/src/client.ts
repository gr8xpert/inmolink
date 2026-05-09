/**
 * Prisma client singleton.
 *
 * Sprint 0 stub — actual import wires up after `pnpm db:generate` runs against the
 * Prisma schema (added in Phase C). Until then this file fails to type-check until
 * deps are installed and schema generated. That's expected.
 */
// @ts-expect-error generated client doesn't exist until `prisma generate` runs
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["error", "warn", "query"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
