#!/usr/bin/env tsx
/**
 * Synthetic bulk seed for pressure testing (PLAN §11.12 / §9.5).
 *
 * Usage:
 *   pnpm --filter @inmolink/worker seed:bulk -- --agencies 10 --properties 1000
 *   pnpm --filter @inmolink/worker seed:bulk -- --agencies 5000 --properties 30000  # full-scale
 *
 * Notes:
 * - Idempotent on re-run via `synthetic-` slug prefix; skips agencies/users
 *   that already exist.
 * - Uses Prisma `createMany` in batches of 1000 for throughput.
 * - **Does NOT seed media** — tests that need cover images can layer on the
 *   existing dev R2 / LocalFsStorage upload pipeline.
 * - Per-property: 1 PropertyTranslation row (en) + 0 features. Add more as
 *   the load test demands.
 */

import { faker } from "@faker-js/faker";
import { hashPassword } from "@inmolink/auth";
import { prisma } from "@inmolink/db";

type Args = {
  agencies: number;
  properties: number;
  countryCode: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  return {
    agencies: Number(get("--agencies", "10")),
    properties: Number(get("--properties", "1000")),
    countryCode: get("--country", "ES") ?? "ES",
  };
}

faker.seed(42); // deterministic across runs — easier to compare baselines

async function main(): Promise<void> {
  const args = parseArgs();
  const target = {
    agencies: Math.max(1, args.agencies),
    properties: Math.max(1, args.properties),
    perAgency: Math.ceil(args.properties / Math.max(1, args.agencies)),
  };
  console.log(
    `seed-bulk: agencies=${target.agencies} properties=${target.properties} (~${target.perAgency}/agency) country=${args.countryCode}`,
  );

  // Need a property type + location to attach to. Fail fast if seed.ts
  // hasn't been run yet (the lookup catalogs are required FK targets).
  const [propertyType, location] = await Promise.all([
    prisma.propertyType.findFirst({ where: { slug: "house" } }),
    prisma.location.findFirst({ where: { level: "CITY" } }),
  ]);
  if (!propertyType || !location) {
    throw new Error(
      "Run `pnpm --filter @inmolink/db db:seed` first to populate PropertyType + Location.",
    );
  }

  const sharedPassword = await hashPassword("synthetic-bench-2026");

  // ---- Agencies + agents ----
  const startAgencies = Date.now();
  const agencyRows: Array<{ id: string }> = [];
  for (let i = 0; i < target.agencies; i++) {
    const slug = `synthetic-agency-${i.toString().padStart(5, "0")}`;
    const existing = await prisma.agency.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      agencyRows.push(existing);
      continue;
    }
    const agency = await prisma.agency.create({
      data: {
        slug,
        name: `${faker.company.name()} (Synthetic)`,
        countryCode: args.countryCode,
        isPublic: true,
        isActive: true,
        email: `agency-${i}@synthetic.local`,
      },
      select: { id: true },
    });
    agencyRows.push(agency);

    // One agent per agency to own properties.
    await prisma.user.upsert({
      where: { email: `agent-${i}@synthetic.local` },
      create: {
        email: `agent-${i}@synthetic.local`,
        passwordHash: sharedPassword,
        slug: `synthetic-agent-${i.toString().padStart(5, "0")}`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        agencyId: agency.id,
        role: "AGENT",
        isActive: true,
        publicProfileEnabled: true,
        languagesSpoken: ["en", "es"],
      },
      update: {},
    });
  }
  console.log(`agencies seeded: ${agencyRows.length} (${Date.now() - startAgencies}ms)`);

  // ---- Properties ----
  // Pre-fetch one agent per agency so we can avoid round-trips inside the
  // hot loop. The seed user is shared across all properties of that agency.
  const agencyToOwner = new Map<string, string>();
  const owners = await prisma.user.findMany({
    where: {
      agencyId: { in: agencyRows.map((a) => a.id) },
      role: "AGENT",
      email: { startsWith: "agent-", endsWith: "@synthetic.local" },
    },
    select: { id: true, agencyId: true },
  });
  for (const o of owners) {
    if (o.agencyId) agencyToOwner.set(o.agencyId, o.id);
  }

  const startProps = Date.now();
  const BATCH = 1000;
  let written = 0;

  for (let agencyIdx = 0; agencyIdx < agencyRows.length; agencyIdx++) {
    const agency = agencyRows[agencyIdx];
    if (!agency) continue;
    const ownerId = agencyToOwner.get(agency.id);
    if (!ownerId) continue;

    const remaining = target.properties - written;
    const toWrite = Math.min(target.perAgency, remaining);
    if (toWrite <= 0) break;

    let writtenForAgency = 0;
    while (writtenForAgency < toWrite) {
      const batchSize = Math.min(BATCH, toWrite - writtenForAgency);
      const propertyData = Array.from({ length: batchSize }, () => ({
        ownerUserId: ownerId,
        ownerAgencyId: agency.id,
        source: "MANUAL" as const,
        status: "ACTIVE" as const,
        visibility: "SHARED" as const,
        publishedAt: new Date(),
        transactionType: "SALE" as const,
        priceCents: BigInt(faker.number.int({ min: 100_000, max: 5_000_000 }) * 100),
        currency: "EUR",
        priceType: "FIXED" as const,
        bedrooms: faker.number.int({ min: 1, max: 6 }),
        bathrooms: faker.number.int({ min: 1, max: 4 }),
        areaM2: faker.number.int({ min: 50, max: 600 }),
        plotM2: faker.number.int({ min: 0, max: 2000 }),
        propertyTypeId: propertyType.id,
        locationId: location.id,
      }));

      const created = await prisma.property.createManyAndReturn({
        data: propertyData,
        select: { id: true },
      });

      // Translations — one per property, en locale only. createMany skips
      // the @@unique(propertyId, locale) collision on retry.
      await prisma.propertyTranslation.createMany({
        data: created.map((p, idx) => {
          const slug = `${p.id.toLowerCase()}-${idx}`;
          return {
            propertyId: p.id,
            locale: "en",
            title: faker.lorem.sentence({ min: 3, max: 6 }).slice(0, 200),
            description: faker.lorem.paragraphs({ min: 1, max: 3 }, "\n"),
            slug: slug.slice(0, 200),
          };
        }),
        skipDuplicates: true,
      });

      writtenForAgency += created.length;
      written += created.length;
    }

    if (agencyIdx % 10 === 0 || agencyIdx === agencyRows.length - 1) {
      const elapsed = (Date.now() - startProps) / 1000;
      const rate = elapsed > 0 ? Math.round(written / elapsed) : 0;
      console.log(`properties: ${written}/${target.properties} (${rate}/s)`);
    }
    if (written >= target.properties) break;
  }

  const total = Date.now() - startProps;
  console.log(
    `done: ${written} properties in ${(total / 1000).toFixed(1)}s (${Math.round(written / (total / 1000))}/s)`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
