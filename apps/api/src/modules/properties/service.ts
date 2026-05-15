import type { propertySchemas } from "@inmolink/shared";
import type { AuthenticatedUser } from "../../plugins/auth";
import { PlanRequiredError, getCurrentPlanTier, tierHasFeature } from "../billing/plan-tier";
import {
  createProperty,
  encodeCursor,
  getPropertyById,
  listProperties,
  softDeleteProperty,
  updateProperty,
} from "./repository";

/**
 * Permission helpers — keep the per-route logic identical:
 *
 * - Read access (visibility filter): viewers see SHARED + their own +
 *   their own agency's properties. PUBLIC is omitted from dashboard
 *   results because the public marketplace surfaces it.
 *
 * - Mutate access:
 *     SUPER_ADMIN → any property
 *     AGENCY_ADMIN → any property in their agency
 *     AGENT → only their own
 */

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "You are not allowed to perform this action") {
    super(message);
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Resource not found") {
    super(message);
  }
}

function ownershipMatches(
  user: AuthenticatedUser,
  property: { ownerUserId: string; ownerAgencyId: string },
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "AGENCY_ADMIN" && user.agencyId === property.ownerAgencyId) return true;
  if (user.role === "AGENT" && user.id === property.ownerUserId) return true;
  return false;
}

export async function listForDashboard(
  user: AuthenticatedUser,
  query: propertySchemas.PropertyListQuery,
) {
  const viewer =
    user.role === "SUPER_ADMIN"
      ? null
      : {
          userId: user.id,
          agencyId: user.agencyId,
          // AGENT vs AGENCY_ADMIN gates the agency-scope OR clause in the
          // repository — agents must not see other agents' private rows.
          role: user.role === "AGENCY_ADMIN" ? ("AGENCY_ADMIN" as const) : ("AGENT" as const),
          // Dashboard hides PUBLIC noise; everyone sees SHARED plus their
          // own (regardless of visibility).
          allowedVisibility: ["SHARED" as const],
        };

  const { items, hasMore, totalCount } = await listProperties({ query, viewer });
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  // Numbered pagination metadata when the caller passed `page` — otherwise
  // null so the client knows to fall back to cursor controls.
  const page = query.page ?? null;
  const pageSize = query.page ? (query.pageSize ?? query.limit) : null;
  const totalPages =
    totalCount !== null && pageSize ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;

  return {
    items: items.map(toListItem),
    nextCursor,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export async function getOneForDashboard(user: AuthenticatedUser, id: string) {
  const property = await getPropertyById(id);
  if (!property) throw new NotFoundError("Property not found");

  // Read scope: any logged-in agent can view SHARED. PRIVATE only to the
  // owner; agency_admin can view their agency's PRIVATE.
  if (property.visibility === "PRIVATE" && !ownershipMatches(user, property)) {
    throw new NotFoundError("Property not found");
  }

  return toDetail(property);
}

/**
 * Plan-tier gate. PLAN §6 / §11.7 — `visibility=PUBLIC` requires PRO. Free
 * agencies setting PUBLIC must upgrade. SUPER_ADMIN bypasses.
 */
async function assertVisibilityAllowed(
  user: AuthenticatedUser,
  visibility: string | undefined,
  ownerAgencyId: string | null,
): Promise<void> {
  if (visibility !== "PUBLIC") return;
  if (user.role === "SUPER_ADMIN") return;
  const tier = await getCurrentPlanTier(ownerAgencyId);
  if (!tierHasFeature(tier, "feature:visibility.public")) {
    throw new PlanRequiredError("PRO");
  }
}

export async function createForUser(
  user: AuthenticatedUser,
  input: propertySchemas.PropertyCreateInput,
) {
  if (!user.agencyId) {
    throw new ForbiddenError("User has no agency — cannot create properties");
  }
  await assertVisibilityAllowed(user, input.visibility, user.agencyId);
  const created = await createProperty({
    input,
    ownerUserId: user.id,
    ownerAgencyId: user.agencyId,
  });
  return toDetail(created);
}

export async function updateForUser(
  user: AuthenticatedUser,
  id: string,
  input: propertySchemas.PropertyUpdateInput,
) {
  const existing = await getPropertyById(id);
  if (!existing) throw new NotFoundError("Property not found");
  if (!ownershipMatches(user, existing)) {
    throw new ForbiddenError();
  }
  // Only run the gate when caller is changing visibility — keeps unrelated
  // edits on PUBLIC properties unblocked even if a grant lapsed.
  if (input.visibility && input.visibility !== existing.visibility) {
    await assertVisibilityAllowed(user, input.visibility, existing.ownerAgencyId);
  }
  const updated = await updateProperty({ id, input });
  return toDetail(updated);
}

export async function softDeleteForUser(user: AuthenticatedUser, id: string) {
  const existing = await getPropertyById(id);
  if (!existing) throw new NotFoundError("Property not found");
  if (!ownershipMatches(user, existing)) {
    throw new ForbiddenError();
  }
  return softDeleteProperty(id);
}

// -------- DTO mappers --------

type ListRow = {
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

function toListItem(row: ListRow) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    ownerAgencyId: row.ownerAgencyId,
    status: row.status as never,
    visibility: row.visibility as never,
    transactionType: row.transactionType as never,
    priceCents: Number(row.priceCents),
    currency: row.currency,
    priceType: row.priceType as never,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaM2: row.areaM2,
    propertyTypeId: row.propertyTypeId,
    locationId: row.locationId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type DetailRow = ListRow & {
  source: string;
  externalRef: string | null;
  plotM2: number | null;
  yearBuilt: number | null;
  latitude: { toNumber(): number } | number | null;
  longitude: { toNumber(): number } | number | null;
  addressLine: string | null;
  postcode: string | null;
  virtualTourUrl: string | null;
  lockedFields: unknown;
  version: number;
  translations: Array<{
    locale: string;
    title: string;
    description: string;
    slug: string;
    metaTitle: string | null;
    metaDescription: string | null;
  }>;
  features: Array<{ featureId: string }>;
};

function toDetail(row: DetailRow) {
  return {
    ...toListItem(row),
    source: row.source as never,
    externalRef: row.externalRef,
    plotM2: row.plotM2,
    yearBuilt: row.yearBuilt,
    latitude: decimalToNumber(row.latitude),
    longitude: decimalToNumber(row.longitude),
    addressLine: row.addressLine,
    postcode: row.postcode,
    virtualTourUrl: row.virtualTourUrl,
    lockedFields: Array.isArray(row.lockedFields) ? (row.lockedFields as string[]) : [],
    version: row.version,
    translations: row.translations.map((t) => ({
      locale: t.locale as never,
      title: t.title,
      description: t.description,
      slug: t.slug,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
    })),
    featureIds: row.features.map((f) => f.featureId),
  };
}

function decimalToNumber(v: { toNumber(): number } | number | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  return v.toNumber();
}
