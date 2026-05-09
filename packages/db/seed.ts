/**
 * Inmolink dev seed.
 *
 * Sprint 0 — minimum viable: a few plans + super-admin user + locked taxonomy
 * stubs. Full fixture (5 agencies / 50 agents / 500 properties per PLAN §11.12)
 * lands in Sprint 12 as a separate `seed-load-test.ts`.
 *
 * Run: pnpm db:seed
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Dev-only default password. Override via DEV_ADMIN_PASSWORD env var.
 * Do NOT use in production — Sprint 4 will add password change + email
 * verification flows.
 */
const DEV_ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? "Inmolink-Dev-2026!";

// Argon2id params kept in sync with packages/auth/src/password.ts (OWASP 2024+).
// We don't import from @inmolink/auth to avoid circular dep (auth → db → auth).
const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

async function main(): Promise<void> {
  // --- Plans ---
  // PLAN §6 — FREE / PRO active in v1; BUSINESS / ENTERPRISE reserved.
  await prisma.plan.upsert({
    where: { tier: "FREE" },
    create: {
      tier: "FREE",
      name: "Free",
      description:
        "Manual upload + imports + chat + viewing requests. No public marketplace listing, no exports, no marketing.",
      position: 0,
      isActive: true,
      features: {
        unlimitedListings: true,
        manualUpload: true,
        imports: true,
        visibilityShared: true,
        visibilityPrivate: true,
        visibilityPublic: false,
        exportCsv: false,
        exportPdf: false,
        marketing: false,
        customEmailDomain: false,
        featuredListings: 0,
      },
    },
    update: {},
  });

  await prisma.plan.upsert({
    where: { tier: "PRO" },
    create: {
      tier: "PRO",
      name: "Pro",
      description:
        "Unlock public marketplace, exports, full email marketing, custom domain, featured listings.",
      position: 1,
      isActive: true,
      features: {
        unlimitedListings: true,
        manualUpload: true,
        imports: true,
        visibilityShared: true,
        visibilityPrivate: true,
        visibilityPublic: true,
        exportCsv: true,
        exportPdf: true,
        marketing: true,
        customEmailDomain: true,
        featuredListings: 10,
      },
    },
    update: {},
  });

  // --- Super-admin agency-of-one ---
  // Created so super-admin login works on a fresh DB. Replace credentials in production.
  const adminAgency = await prisma.agency.upsert({
    where: { slug: "inmolink-admin" },
    create: {
      slug: "inmolink-admin",
      name: "Inmolink Admin",
      countryCode: "ES",
      isActive: true,
      isPublic: false,
    },
    update: {},
  });

  const passwordHash = await hash(DEV_ADMIN_PASSWORD, ARGON2_OPTS);

  await prisma.user.upsert({
    where: { email: "admin@inmolink.local" },
    create: {
      email: "admin@inmolink.local",
      slug: "inmolink-admin",
      firstName: "Inmolink",
      lastName: "Admin",
      role: "SUPER_ADMIN",
      agencyId: adminAgency.id,
      languagesSpoken: ["en", "es", "de", "fr"],
      emailVerifiedAt: new Date(), // dev: skip verification flow
      passwordHash,
    },
    update: {
      // Always reset the dev password on re-seed (idempotent).
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log("Seed complete:");
  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log("  - plans (FREE, PRO)");
  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log("  - super-admin agency: inmolink-admin");
  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log("  - super-admin user:  admin@inmolink.local");
  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log(`  - dev password:      ${DEV_ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    // biome-ignore lint/suspicious/noConsoleLog: seed script
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
