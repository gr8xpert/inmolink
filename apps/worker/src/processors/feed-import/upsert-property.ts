import { prisma } from "@inmolink/db";
import {
  type FeedConnectorKind,
  type NormalizedListing,
  findFeatureIdsByName,
  findLocationForTown,
  findPropertyTypeForFeed,
} from "@inmolink/imports";
import { feedImportSchemas } from "@inmolink/shared";

type LockableField = feedImportSchemas.LockableField;
const { lockedFieldsSchema } = feedImportSchemas;
import type { Prisma, PropertyStatus, PropertyVisibility } from "@prisma/client";

/**
 * Upsert a Property from a NormalizedListing emitted by a connector.
 *
 * Identity: `(source, externalRef)` is unique. On a hit we apply field-level
 * lock semantics — if the agent has manually edited a field on the dashboard
 * and added it to `Property.lockedFields`, the connector skips that field
 * on update (PLAN row 16). On a miss we create the row.
 *
 * Status: properties land in DRAFT when the connector couldn't resolve the
 * PropertyType or Location — the agent gets an alert and triages from the
 * dashboard. Otherwise ACTIVE / SHARED so other agents see the listing.
 *
 * Translations: replaced wholesale per (locale) — the connector is the
 * source of truth for translations unless the "translations" field is
 * locked. PropertyFeature m2m: replaced wholesale unless "features" locked.
 *
 * Returns the persisted Property id + a flag indicating whether the worker
 * should run the image-attach pass (skipped when "images" is locked).
 */
export type UpsertResult =
  | {
      action: "created" | "updated";
      propertyId: string;
      runImages: boolean;
      droppedToDraft: boolean;
      featureNamesUnmatched: string[];
    }
  | { action: "skipped-locked"; reason: string };

export async function upsertPropertyFromListing(args: {
  ownerUserId: string;
  ownerAgencyId: string;
  source: FeedConnectorKind;
  listing: NormalizedListing;
}): Promise<UpsertResult> {
  const { ownerUserId, ownerAgencyId, source, listing } = args;

  // Resolve taxonomy first so the new-property branch has the same
  // information available as the update branch.
  const [typeMatch, locationMatch, featureMatch] = await Promise.all([
    findPropertyTypeForFeed({ kind: source, sourceLabel: listing.typeName }),
    findLocationForTown({
      townName: listing.townName,
      provinceName: listing.provinceName,
      countryCode: listing.countryCode,
    }),
    findFeatureIdsByName(listing.features.map((f) => f.canonical)),
  ]);

  const droppedToDraft = !typeMatch.matched || !locationMatch.matched;
  const targetStatus: PropertyStatus = droppedToDraft ? "DRAFT" : "ACTIVE";
  const targetVisibility: PropertyVisibility = "SHARED";

  const existing = await prisma.property.findUnique({
    where: { source_externalRef: { source, externalRef: listing.externalRef } },
    select: {
      id: true,
      lockedFields: true,
      ownerUserId: true,
      ownerAgencyId: true,
      version: true,
    },
  });

  const lockedFields = parseLockedFields(existing?.lockedFields);
  const isLocked = (k: LockableField): boolean => lockedFields.includes(k);

  if (existing) {
    return await updateProperty({
      existing,
      listing,
      typeMatch,
      locationMatch,
      featureMatch,
      isLocked,
      droppedToDraft,
      targetStatus,
    });
  }

  return await createProperty({
    ownerUserId,
    ownerAgencyId,
    source,
    listing,
    typeMatch,
    locationMatch,
    featureMatch,
    targetStatus,
    targetVisibility,
    droppedToDraft,
  });
}

function parseLockedFields(value: unknown): LockableField[] {
  if (!value) return [];
  const parsed = lockedFieldsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

async function createProperty(args: {
  ownerUserId: string;
  ownerAgencyId: string;
  source: FeedConnectorKind;
  listing: NormalizedListing;
  typeMatch: Awaited<ReturnType<typeof findPropertyTypeForFeed>>;
  locationMatch: Awaited<ReturnType<typeof findLocationForTown>>;
  featureMatch: Awaited<ReturnType<typeof findFeatureIdsByName>>;
  targetStatus: PropertyStatus;
  targetVisibility: PropertyVisibility;
  droppedToDraft: boolean;
}): Promise<UpsertResult> {
  const { ownerUserId, ownerAgencyId, source, listing } = args;

  // For drafted properties without a type/location, we still need *some*
  // valid FK if the schema requires non-null. Look at the schema:
  // PropertyType FK is required, Location FK is required.
  // → require both to be matched, else surface as DRAFT-but-fail.
  // Pragmatic: skip creation entirely when DRAFT-because-unresolved on a
  // brand-new listing. Worker logs the skip; super-admin extends the
  // mapping table; next run picks the listing up.
  if (!args.typeMatch.matched || !args.locationMatch.matched) {
    return {
      action: "skipped-locked",
      reason: "Cannot create property: PropertyType or Location unmapped",
    };
  }

  const featureMatch = args.featureMatch;
  const propertyTypeId = args.typeMatch.matched ? args.typeMatch.propertyTypeId : null;
  const locationId = args.locationMatch.matched ? args.locationMatch.locationId : null;
  if (!propertyTypeId || !locationId) {
    // Defensive: handled above but keeps TS happy.
    return { action: "skipped-locked", reason: "Cannot create property: unresolved FKs" };
  }

  const data: Prisma.PropertyCreateInput = {
    owner: { connect: { id: ownerUserId } },
    agency: { connect: { id: ownerAgencyId } },
    propertyType: { connect: { id: propertyTypeId } },
    location: { connect: { id: locationId } },
    source,
    externalRef: listing.externalRef,
    status: args.targetStatus,
    visibility: args.targetVisibility,
    priceType: "fixed",
    transactionType: listing.transactionType,
    priceCents: listing.priceCents,
    currency: listing.currency,
    bedrooms: listing.bedrooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    areaM2: listing.areaM2 ?? null,
    plotM2: listing.plotM2 ?? null,
    yearBuilt: listing.yearBuilt ?? null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    postcode: listing.postcode ?? null,
    addressLine: listing.addressLine ?? null,
    videoUrl: listing.videoUrl ?? null,
    virtualTourUrl: listing.virtualTourUrl ?? null,
    sourceUpdatedAt: listing.sourceUpdatedAt ?? null,
    translations: {
      create: Object.entries(listing.translations).map(([locale, t]) => ({
        locale,
        title: t?.title ?? "",
        description: t?.description ?? "",
        slug: deriveSlug(t?.title ?? listing.externalRef, listing.externalRef),
      })),
    },
    features:
      featureMatch.matchedFeatureIds.length > 0
        ? {
            create: featureMatch.matchedFeatureIds.map((featureId) => ({
              feature: { connect: { id: featureId } },
            })),
          }
        : undefined,
  };

  const created = await prisma.property.create({
    data,
    select: { id: true },
  });

  return {
    action: "created",
    propertyId: created.id,
    runImages: true,
    droppedToDraft: args.droppedToDraft,
    featureNamesUnmatched: featureMatch.unmatchedNames,
  };
}

async function updateProperty(args: {
  existing: { id: string; ownerUserId: string; ownerAgencyId: string; version: number };
  listing: NormalizedListing;
  typeMatch: Awaited<ReturnType<typeof findPropertyTypeForFeed>>;
  locationMatch: Awaited<ReturnType<typeof findLocationForTown>>;
  featureMatch: Awaited<ReturnType<typeof findFeatureIdsByName>>;
  isLocked: (k: LockableField) => boolean;
  droppedToDraft: boolean;
  targetStatus: PropertyStatus;
}): Promise<UpsertResult> {
  const { existing, listing, isLocked } = args;

  const update: Prisma.PropertyUpdateInput = {};

  if (!isLocked("price")) {
    update.priceCents = listing.priceCents;
    update.currency = listing.currency;
  }
  if (!isLocked("transactionType")) update.transactionType = listing.transactionType;
  if (!isLocked("propertyTypeId") && args.typeMatch.matched) {
    update.propertyType = { connect: { id: args.typeMatch.propertyTypeId } };
  }
  if (!isLocked("locationId") && args.locationMatch.matched) {
    update.location = { connect: { id: args.locationMatch.locationId } };
  }
  if (!isLocked("latitude") && listing.latitude !== undefined) update.latitude = listing.latitude;
  if (!isLocked("longitude") && listing.longitude !== undefined)
    update.longitude = listing.longitude;
  if (!isLocked("bedrooms")) update.bedrooms = listing.bedrooms ?? null;
  if (!isLocked("bathrooms")) update.bathrooms = listing.bathrooms ?? null;
  if (!isLocked("areaM2")) update.areaM2 = listing.areaM2 ?? null;
  if (!isLocked("plotM2")) update.plotM2 = listing.plotM2 ?? null;
  if (!isLocked("yearBuilt")) update.yearBuilt = listing.yearBuilt ?? null;
  update.sourceUpdatedAt = listing.sourceUpdatedAt ?? null;
  // Status: never push back to DRAFT once the agent has accepted; only the
  // first feed run that introduces a listing controls DRAFT vs ACTIVE.

  const tx: Prisma.PrismaPromise<unknown>[] = [
    prisma.property.update({ where: { id: existing.id }, data: update }),
  ];

  if (!isLocked("translations")) {
    tx.push(prisma.propertyTranslation.deleteMany({ where: { propertyId: existing.id } }));
    for (const [locale, t] of Object.entries(listing.translations)) {
      tx.push(
        prisma.propertyTranslation.create({
          data: {
            propertyId: existing.id,
            locale,
            title: t?.title ?? "",
            description: t?.description ?? "",
            slug: deriveSlug(t?.title ?? listing.externalRef, listing.externalRef),
          },
        }),
      );
    }
  }

  if (!isLocked("features")) {
    tx.push(prisma.propertyFeature.deleteMany({ where: { propertyId: existing.id } }));
    for (const featureId of args.featureMatch.matchedFeatureIds) {
      tx.push(
        prisma.propertyFeature.create({
          data: { propertyId: existing.id, featureId },
        }),
      );
    }
  }

  await prisma.$transaction(tx);

  return {
    action: "updated",
    propertyId: existing.id,
    runImages: !isLocked("images"),
    droppedToDraft: args.droppedToDraft,
    featureNamesUnmatched: args.featureMatch.unmatchedNames,
  };
}

function deriveSlug(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback.toLowerCase().slice(0, 80);
}
