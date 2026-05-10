import { prisma } from "@inmolink/db";
import type { marketingSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";
import { getCurrentPlanTier, tierHasFeature } from "../billing/plan-tier";
import { ForbiddenError, NotFoundError, decodeCursor, encodeCursor } from "./service";

/**
 * FeaturedListing is curated by super-admin. The agency must be on a tier
 * that includes featured listings (PRO+).
 */

function toFeaturedRow(r: {
  id: string;
  propertyId: string;
  agencyId: string;
  surface: string;
  startsAt: Date;
  endsAt: Date;
  position: number;
  source: string;
  createdAt: Date;
  agency: { name: string };
  property: {
    translations: Array<{ title: string; locale: string }>;
  };
}): marketingSchemas.FeaturedListing {
  // Pick first available translation title — public rendering re-resolves
  // per-locale; this is purely the admin surface.
  const title = r.property.translations[0]?.title ?? null;
  return {
    id: r.id,
    propertyId: r.propertyId,
    agencyId: r.agencyId,
    agencyName: r.agency.name,
    propertyTitle: title,
    surface: r.surface as marketingSchemas.FeaturedSurface,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    position: r.position,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listFeaturedAdmin(
  user: AuthenticatedUser,
  query: { cursor?: string; limit?: number; surface?: string; activeOnly?: boolean },
) {
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const decoded = decodeCursor(query.cursor);

  const where: Prisma.FeaturedListingWhereInput = {};
  if (query.surface) where.surface = query.surface;
  if (query.activeOnly) {
    where.startsAt = { lte: new Date() };
    where.endsAt = { gte: new Date() };
  }
  if (decoded) {
    where.OR = [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
    ];
  }

  const rows = await prisma.featuredListing.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      agency: { select: { name: true } },
      property: { select: { translations: { select: { title: true, locale: true }, take: 1 } } },
    },
  });
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  return {
    items: slice.map(toFeaturedRow),
    nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null,
  };
}

export async function createFeatured(
  user: AuthenticatedUser,
  input: marketingSchemas.FeaturedListingInput,
): Promise<marketingSchemas.FeaturedListing> {
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: {
      id: true,
      ownerAgencyId: true,
      visibility: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!property || property.deletedAt) throw new NotFoundError("Property not found");
  if (property.visibility !== "PUBLIC" || property.status !== "ACTIVE") {
    throw new ForbiddenError("Property must be ACTIVE + PUBLIC to be featured");
  }
  // Plan-tier check on the owning agency. PRO+ only.
  const tier = await getCurrentPlanTier(property.ownerAgencyId);
  if (!tierHasFeature(tier, "feature:featured.listings")) {
    throw new ForbiddenError("Agency plan does not include featured listings");
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ForbiddenError("endsAt must be after startsAt");
  }

  const created = await prisma.featuredListing.create({
    data: {
      propertyId: property.id,
      agencyId: property.ownerAgencyId,
      surface: input.surface,
      startsAt,
      endsAt,
      position: input.position,
      source: input.source,
    },
    include: {
      agency: { select: { name: true } },
      property: { select: { translations: { select: { title: true, locale: true }, take: 1 } } },
    },
  });
  return toFeaturedRow(created);
}

export async function deleteFeatured(user: AuthenticatedUser, id: string): Promise<void> {
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  const r = await prisma.featuredListing.deleteMany({ where: { id } });
  if (r.count === 0) throw new NotFoundError("Featured listing not found");
}

/**
 * Public marketplace data: top featured properties for a given surface,
 * scoped to the active window. Used by apps/public homepage etc.
 */
export async function getActiveFeatured(
  surface: marketingSchemas.FeaturedSurface,
  locale: string,
  limit = 6,
): Promise<marketingSchemas.PublicFeaturedPropertyCard[]> {
  const now = new Date();
  const rows = await prisma.featuredListing.findMany({
    where: {
      surface,
      startsAt: { lte: now },
      endsAt: { gte: now },
      property: {
        deletedAt: null,
        status: "ACTIVE",
        visibility: "PUBLIC",
      },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(50, limit)),
    include: {
      property: {
        include: {
          translations: true,
          images: {
            where: { isCover: true },
            include: { mediaObject: { select: { hash: true } } },
            take: 1,
          },
          agency: {
            select: { name: true, slug: true, logoR2Key: true },
          },
        },
      },
    },
  });

  return rows
    .map((r) => {
      const property = (
        r as typeof r & {
          property: {
            translations: Array<{ title: string; locale: string; slug: string }>;
            images: Array<{ mediaObject: { hash: string } }>;
            agency: { name: string; slug: string; logoR2Key: string | null };
            priceCents: bigint;
            currency: string;
            transactionType: string;
            bedrooms: number | null;
            bathrooms: number | null;
            areaM2: number | null;
          };
        }
      ).property;
      const tx = property.translations.find((t) => t.locale === locale) ?? property.translations[0];
      if (!tx) return null;
      const cover = property.images[0];
      return {
        propertyId: r.propertyId,
        slug: tx.slug,
        title: tx.title,
        priceCents: Number(property.priceCents),
        currency: property.currency,
        transactionType: property.transactionType,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        areaM2: property.areaM2,
        coverImageHash: cover?.mediaObject.hash ?? null,
        agencyName: property.agency.name,
        agencySlug: property.agency.slug,
        agencyLogoR2Key: property.agency.logoR2Key,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
