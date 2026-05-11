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

  // --- Minimum taxonomy so the dashboard create form has options ---
  // Sprint 2 ships the super-admin curation UI; this is a placeholder set
  // sufficient for slice F.2 manual property creation. Idempotent via
  // stable explicit ids.
  await prisma.propertyTypeGroup.upsert({
    where: { id: "ptg_residential" },
    create: {
      id: "ptg_residential",
      position: 0,
      isActive: true,
      translations: {
        create: [
          { locale: "en", name: "Residential", slug: "residential" },
          { locale: "es", name: "Residencial", slug: "residencial" },
          { locale: "de", name: "Wohnen", slug: "wohnen" },
          { locale: "fr", name: "Résidentiel", slug: "residentiel" },
        ],
      },
    },
    update: {},
  });

  const PROPERTY_TYPES = [
    {
      id: "pt_apartment",
      iconName: "Building2",
      labels: { en: "Apartment", es: "Apartamento", de: "Wohnung", fr: "Appartement" },
    },
    {
      id: "pt_house",
      iconName: "Home",
      labels: { en: "House", es: "Casa", de: "Haus", fr: "Maison" },
    },
    {
      id: "pt_villa",
      iconName: "Castle",
      labels: { en: "Villa", es: "Villa", de: "Villa", fr: "Villa" },
    },
    {
      id: "pt_plot",
      iconName: "Trees",
      labels: { en: "Plot", es: "Parcela", de: "Grundstück", fr: "Terrain" },
    },
    {
      id: "pt_commercial",
      iconName: "Store",
      labels: { en: "Commercial", es: "Comercial", de: "Gewerbe", fr: "Commercial" },
    },
  ] as const;

  for (const [pos, t] of PROPERTY_TYPES.entries()) {
    await prisma.propertyType.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        groupId: "ptg_residential",
        position: pos,
        isActive: true,
        iconKind: "LIBRARY",
        iconName: t.iconName,
        translations: {
          create: (Object.keys(t.labels) as Array<keyof typeof t.labels>).map((loc) => ({
            locale: loc,
            name: t.labels[loc],
            slug: t.labels[loc].toLowerCase().replaceAll(" ", "-"),
          })),
        },
      },
      update: {},
    });
  }

  // --- Locations: ES > Málaga, ES > Madrid (CITY level — sufficient for
  // basic property creation; finer levels added later).
  await prisma.location.upsert({
    where: { id: "loc_es" },
    create: {
      id: "loc_es",
      level: "COUNTRY",
      countryCode: "ES",
      position: 0,
      isActive: true,
      translations: {
        create: [
          { locale: "en", name: "Spain", slug: "spain" },
          { locale: "es", name: "España", slug: "espana" },
          { locale: "de", name: "Spanien", slug: "spanien" },
          { locale: "fr", name: "Espagne", slug: "espagne" },
        ],
      },
    },
    update: {},
  });

  const CITIES = [
    { id: "loc_es_malaga", labels: { en: "Málaga", es: "Málaga", de: "Málaga", fr: "Málaga" } },
    { id: "loc_es_madrid", labels: { en: "Madrid", es: "Madrid", de: "Madrid", fr: "Madrid" } },
    {
      id: "loc_es_barcelona",
      labels: { en: "Barcelona", es: "Barcelona", de: "Barcelona", fr: "Barcelone" },
    },
  ] as const;

  for (const [pos, c] of CITIES.entries()) {
    await prisma.location.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        level: "CITY",
        parentId: "loc_es",
        countryCode: "ES",
        position: pos,
        isActive: true,
        translations: {
          create: (Object.keys(c.labels) as Array<keyof typeof c.labels>).map((loc) => ({
            locale: loc,
            name: c.labels[loc],
            slug: `${c.labels[loc].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}-es`,
          })),
        },
      },
      update: {},
    });
  }

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
  // biome-ignore lint/suspicious/noConsoleLog: seed script
  console.log("  - 5 property types, 1 group, 3 cities under Spain");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
