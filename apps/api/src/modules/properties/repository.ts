import { prisma } from "@inmolink/db";
import type { propertySchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import { emitWebhookEvent } from "../../lib/webhooks";
import { emitSearchPropertyDelete, emitSearchPropertyUpsert } from "../outbox/service";

type ListItemRow = {
  id: string;
  ownerUserId: string;
  ownerAgencyId: string;
  status: string;
  visibility: string;
  transactionType: string;
  priceCents: bigint;
  currency: string;
  priceType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  propertyTypeId: string;
  locationId: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const LIST_SELECT = {
  id: true,
  ownerUserId: true,
  ownerAgencyId: true,
  status: true,
  visibility: true,
  transactionType: true,
  priceCents: true,
  currency: true,
  priceType: true,
  bedrooms: true,
  bathrooms: true,
  areaM2: true,
  propertyTypeId: true,
  locationId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PropertySelect;

const DETAIL_INCLUDE = {
  translations: {
    select: {
      locale: true,
      title: true,
      description: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
    },
  },
  features: { select: { featureId: true } },
} satisfies Prisma.PropertyInclude;

/**
 * Cursor format: opaque base64 of `${createdAtIso}|${id}`. Stays portable
 * if we change pagination key later.
 */
export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(`${item.createdAt.toISOString()}|${item.id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = decoded.split("|");
    if (!iso || !id) return null;
    return { createdAt: new Date(iso), id };
  } catch {
    return null;
  }
}

type ListArgs = {
  query: propertySchemas.PropertyListQuery;
  /**
   * Visibility filter applied per session (PLAN §3 "every read query").
   * - If null: return *all* (super-admin only path).
   * - Otherwise: rows where visibility ∈ allowed OR ownerUserId === viewerUserId.
   */
  viewer: {
    userId: string;
    agencyId: string | null;
    allowedVisibility: ("PRIVATE" | "SHARED" | "PUBLIC")[];
  } | null;
};

export async function listProperties({ query, viewer }: ListArgs): Promise<{
  items: ListItemRow[];
  hasMore: boolean;
  /** Total matching rows (offset-mode only — null on cursor mode). */
  totalCount: number | null;
}> {
  const where: Prisma.PropertyWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
    ...(query.transactionType ? { transactionType: query.transactionType } : {}),
    ...(query.propertyTypeId ? { propertyTypeId: query.propertyTypeId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
    ...(query.ownerAgencyId ? { ownerAgencyId: query.ownerAgencyId } : {}),
  };

  if (viewer) {
    where.OR = [
      { visibility: { in: viewer.allowedVisibility } },
      { ownerUserId: viewer.userId },
      ...(viewer.agencyId ? [{ ownerAgencyId: viewer.agencyId }] : []),
    ];
  }

  // Page mode wins when set — dashboard scope is small enough that OFFSET
  // is fine (per-user/per-agency cap). Cursor mode stays for hot public
  // surfaces and acts as the default when neither is supplied.
  if (query.page) {
    const pageSize = query.pageSize ?? query.limit;
    const skip = (query.page - 1) * pageSize;
    const [rows, totalCount] = await Promise.all([
      prisma.property.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.property.count({ where }),
    ]);
    return { items: rows, hasMore: skip + rows.length < totalCount, totalCount };
  }

  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    where.AND = [
      ...((where.AND as Prisma.PropertyWhereInput[] | undefined) ?? []),
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const limit = query.limit;
  const rows = await prisma.property.findMany({
    where,
    select: LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), hasMore, totalCount: null };
}

export async function getPropertyById(id: string) {
  return prisma.property.findFirst({
    where: { id, deletedAt: null },
    include: DETAIL_INCLUDE,
  });
}

type CreateArgs = {
  input: propertySchemas.PropertyCreateInput;
  ownerUserId: string;
  ownerAgencyId: string;
};

export async function createProperty({ input, ownerUserId, ownerAgencyId }: CreateArgs) {
  // Wrapped in a transaction so the OutboxEvent row commits atomically with
  // the property write — if either fails, search index never drifts (PLAN §11.5).
  return prisma.$transaction(async (tx) => {
    const created = await tx.property.create({
      data: {
        ownerUserId,
        ownerAgencyId,
        source: "MANUAL",
        status: input.status,
        visibility: input.visibility,
        publishedAt: input.status === "ACTIVE" ? new Date() : null,
        transactionType: input.transactionType,
        priceCents: BigInt(input.priceCents),
        currency: input.currency,
        priceType: input.priceType,
        bedrooms: input.bedrooms ?? null,
        bathrooms: input.bathrooms ?? null,
        areaM2: input.areaM2 ?? null,
        plotM2: input.plotM2 ?? null,
        yearBuilt: input.yearBuilt ?? null,
        propertyTypeId: input.propertyTypeId,
        locationId: input.locationId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        addressLine: input.addressLine ?? null,
        postcode: input.postcode ?? null,
        virtualTourUrl: input.virtualTourUrl ?? null,
        translations: {
          create: input.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            description: t.description,
            slug: t.slug,
            metaTitle: t.metaTitle ?? null,
            metaDescription: t.metaDescription ?? null,
          })),
        },
        features:
          input.featureIds.length > 0
            ? {
                create: input.featureIds.map((featureId) => ({ featureId })),
              }
            : undefined,
      },
      include: DETAIL_INCLUDE,
    });

    // Indexable iff publicly visible + active + has a published date. We
    // still emit on private/draft so the worker can decide to remove from
    // index — keeps the visibility transition obvious in the event log.
    await emitSearchPropertyUpsert(tx, { propertyId: created.id, reason: "create" });

    await emitWebhookEvent(tx, {
      type: "PROPERTY_CREATED",
      agencyId: ownerAgencyId,
      payload: {
        propertyId: created.id,
        status: created.status,
        visibility: created.visibility,
        priceCents: created.priceCents.toString(),
        currency: created.currency,
        transactionType: created.transactionType,
      },
    });

    return created;
  });
}

type UpdateArgs = {
  id: string;
  input: propertySchemas.PropertyUpdateInput;
};

export async function updateProperty({ id, input }: UpdateArgs) {
  return prisma.$transaction(async (tx) => {
    // Optimistic concurrency: bump version. Fields that aren't in the input
    // stay untouched.
    const updateData: Prisma.PropertyUpdateInput = {
      version: { increment: 1 },
    };
    if (input.status !== undefined) updateData.status = input.status;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.status === "ACTIVE") updateData.publishedAt = new Date();
    if (input.transactionType !== undefined) updateData.transactionType = input.transactionType;
    if (input.priceCents !== undefined) updateData.priceCents = BigInt(input.priceCents);
    if (input.currency !== undefined) updateData.currency = input.currency;
    if (input.priceType !== undefined) updateData.priceType = input.priceType;
    if (input.bedrooms !== undefined) updateData.bedrooms = input.bedrooms;
    if (input.bathrooms !== undefined) updateData.bathrooms = input.bathrooms;
    if (input.areaM2 !== undefined) updateData.areaM2 = input.areaM2;
    if (input.plotM2 !== undefined) updateData.plotM2 = input.plotM2;
    if (input.yearBuilt !== undefined) updateData.yearBuilt = input.yearBuilt;
    if (input.propertyTypeId !== undefined) {
      updateData.propertyType = { connect: { id: input.propertyTypeId } };
    }
    if (input.locationId !== undefined) {
      updateData.location = { connect: { id: input.locationId } };
    }
    if (input.latitude !== undefined) updateData.latitude = input.latitude;
    if (input.longitude !== undefined) updateData.longitude = input.longitude;
    if (input.addressLine !== undefined) updateData.addressLine = input.addressLine;
    if (input.postcode !== undefined) updateData.postcode = input.postcode;
    if (input.virtualTourUrl !== undefined) updateData.virtualTourUrl = input.virtualTourUrl;
    if (input.lockedFields !== undefined) updateData.lockedFields = input.lockedFields;

    await tx.property.update({ where: { id }, data: updateData });

    if (input.translations) {
      // Replace by (propertyId, locale) — upsert each.
      for (const t of input.translations) {
        await tx.propertyTranslation.upsert({
          where: { propertyId_locale: { propertyId: id, locale: t.locale } },
          create: {
            propertyId: id,
            locale: t.locale,
            title: t.title,
            description: t.description,
            slug: t.slug,
            metaTitle: t.metaTitle ?? null,
            metaDescription: t.metaDescription ?? null,
          },
          update: {
            title: t.title,
            description: t.description,
            slug: t.slug,
            metaTitle: t.metaTitle ?? null,
            metaDescription: t.metaDescription ?? null,
          },
        });
      }
    }

    if (input.featureIds) {
      // Replace m2m: delete then re-create.
      await tx.propertyFeature.deleteMany({ where: { propertyId: id } });
      if (input.featureIds.length > 0) {
        await tx.propertyFeature.createMany({
          data: input.featureIds.map((featureId) => ({ propertyId: id, featureId })),
        });
      }
    }

    // If this update flipped visibility to non-public, the worker reads the
    // current row when applying — it'll naturally remove from the index. We
    // still emit `update` because reason is informational, not load-bearing.
    const reason: "update" | "feature_change" =
      input.featureIds !== undefined ? "feature_change" : "update";
    await emitSearchPropertyUpsert(tx, { propertyId: id, reason });

    const finalRow = await tx.property.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    await emitWebhookEvent(tx, {
      type: "PROPERTY_UPDATED",
      agencyId: finalRow.ownerAgencyId,
      payload: {
        propertyId: id,
        status: finalRow.status,
        visibility: finalRow.visibility,
        reason,
      },
    });
    return finalRow;
  });
}

const SOFT_DELETE_RETENTION_DAYS = 30;

export async function softDeleteProperty(id: string) {
  const now = new Date();
  const hardDeleteAt = new Date(now.getTime() + SOFT_DELETE_RETENTION_DAYS * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.property.update({
      where: { id },
      data: { deletedAt: now, hardDeleteAt },
      select: { id: true, deletedAt: true, hardDeleteAt: true, ownerAgencyId: true },
    });
    // Pull from search across every locale right away so a public
    // visitor can't keep finding a soft-deleted listing for the 30-day
    // hard-delete grace window. Hard-delete worker emits no second event
    // — the index entry is already gone.
    await emitSearchPropertyDelete(tx, { propertyId: id, reason: "soft_delete" });

    await emitWebhookEvent(tx, {
      type: "PROPERTY_DELETED",
      agencyId: updated.ownerAgencyId,
      payload: { propertyId: id, hardDeleteAt: hardDeleteAt.toISOString() },
    });
    return updated;
  });
}
