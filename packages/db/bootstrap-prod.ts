/**
 * Inmolink production bootstrap.
 *
 * Creates the minimum viable production data set: plans (FREE/PRO), one
 * super-admin user, and locked taxonomy stubs. **Refuses to run unless**
 * `ADMIN_EMAIL` and `ADMIN_PASSWORD` are provided and the admin password is
 * not a known development default. Never prints the admin password.
 *
 * Run on the VPS once, after `prisma migrate deploy`:
 *
 *     ADMIN_EMAIL=ops@inmolink.eu ADMIN_PASSWORD='...' \
 *       pnpm --filter @inmolink/db bootstrap:prod
 *
 * Idempotent: re-running will not overwrite the admin password.
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

const DEV_DEFAULTS = new Set<string>([
  "Inmolink-Dev-2026!",
  "admin",
  "password",
  "changeme",
  "change-me",
]);

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!adminEmail) fail("ADMIN_EMAIL is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) fail("ADMIN_EMAIL must be a valid email");
  if (adminEmail.endsWith("@inmolink.local")) {
    fail("ADMIN_EMAIL cannot use the inmolink.local dev domain in production");
  }
  if (!adminPassword) fail("ADMIN_PASSWORD is required");
  if (adminPassword.length < 16) fail("ADMIN_PASSWORD must be at least 16 characters");
  if (DEV_DEFAULTS.has(adminPassword)) fail("ADMIN_PASSWORD is a known development default");

  const prisma = new PrismaClient();

  try {
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

    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      console.log(`Admin user ${adminEmail} already exists. Skipping create.`);
    } else {
      const passwordHash = await hash(adminPassword, ARGON2_OPTS);
      await prisma.user.create({
        data: {
          email: adminEmail,
          slug: "inmolink-admin",
          firstName: "Inmolink",
          lastName: "Admin",
          role: "SUPER_ADMIN",
          agencyId: adminAgency.id,
          languagesSpoken: ["en", "es", "de", "fr"],
          emailVerifiedAt: new Date(),
          passwordHash,
        },
      });
      console.log(`Created super-admin: ${adminEmail}`);
    }

    console.log("Production bootstrap complete. Admin password NOT printed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
