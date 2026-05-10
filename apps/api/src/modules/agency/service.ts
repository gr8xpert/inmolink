import type { agencySchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";
import {
  type AgencyRow,
  getAgency,
  replaceTranslations,
  updateAgency,
  upsertSettings,
} from "./repository";

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}
export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}

const DEFAULT_SETTINGS: agencySchemas.AgencySettingsT = {
  defaultCommissionPct: 5,
  defaultIntroducerSharePct: 50,
  viewingResponseDays: 3,
  dealConfirmationDays: 14,
};

/**
 * Resolve which agency the caller is allowed to write. v1 keeps it simple:
 * the user's own agencyId. SUPER_ADMIN can read/write any agency by passing
 * an explicit `?agencyId=` (rarely needed; super-admin has the SQL console).
 */
function resolveAgencyId(user: AuthenticatedUser, queryAgencyId?: string): string {
  if (user.role === "SUPER_ADMIN") {
    return queryAgencyId ?? user.agencyId ?? throwNoAgency();
  }
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  return user.agencyId;
}

function throwNoAgency(): never {
  throw new ForbiddenError("Provide ?agencyId= when calling as super-admin without a home agency");
}

function requireAdmin(user: AuthenticatedUser, agencyId: string): void {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role === "AGENCY_ADMIN" && user.agencyId === agencyId) return;
  throw new ForbiddenError("AGENCY_ADMIN role required");
}

export async function getMyAgency(
  user: AuthenticatedUser,
  storage: Storage,
  queryAgencyId?: string,
): Promise<agencySchemas.AgencyDetail> {
  const id = resolveAgencyId(user, queryAgencyId);
  const row = await getAgency(id);
  if (!row) throw new NotFoundError("Agency not found");
  return toDetail(row, storage);
}

export async function updateMyAgencyDetails(
  user: AuthenticatedUser,
  input: agencySchemas.AgencyDetailsUpdateInput,
  storage: Storage,
  queryAgencyId?: string,
): Promise<agencySchemas.AgencyDetail> {
  const id = resolveAgencyId(user, queryAgencyId);
  requireAdmin(user, id);

  const data: Prisma.AgencyUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.email !== undefined) data.email = input.email ?? null;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.website !== undefined) data.website = normaliseEmptyToNull(input.website);
  if (input.whatsappNumber !== undefined) data.whatsappNumber = input.whatsappNumber ?? null;
  if (input.socialFacebook !== undefined)
    data.socialFacebook = normaliseEmptyToNull(input.socialFacebook);
  if (input.socialInstagram !== undefined)
    data.socialInstagram = normaliseEmptyToNull(input.socialInstagram);
  if (input.socialLinkedin !== undefined)
    data.socialLinkedin = normaliseEmptyToNull(input.socialLinkedin);
  if (input.socialTwitter !== undefined)
    data.socialTwitter = normaliseEmptyToNull(input.socialTwitter);
  if (input.countryCode !== undefined) data.countryCode = input.countryCode;
  if (input.isPublic !== undefined) data.isPublic = input.isPublic;

  try {
    const updated = await updateAgency(id, data);
    if (!updated) throw new NotFoundError("Agency not found");
    return toDetail(updated, storage);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("That slug is already taken — pick another");
    }
    throw err;
  }
}

export async function updateMyAgencyBranding(
  user: AuthenticatedUser,
  input: agencySchemas.AgencyBrandingUpdateInput,
  storage: Storage,
  queryAgencyId?: string,
): Promise<agencySchemas.AgencyDetail> {
  const id = resolveAgencyId(user, queryAgencyId);
  requireAdmin(user, id);

  const data: Prisma.AgencyUpdateInput = {};
  if (input.logoR2Key !== undefined) data.logoR2Key = input.logoR2Key ?? null;
  if (input.bannerR2Key !== undefined) data.bannerR2Key = input.bannerR2Key ?? null;
  if (input.heroImageR2Key !== undefined) data.heroImageR2Key = input.heroImageR2Key ?? null;

  const updated = await updateAgency(id, data);
  if (!updated) throw new NotFoundError("Agency not found");
  return toDetail(updated, storage);
}

export async function updateMyAgencyTranslations(
  user: AuthenticatedUser,
  input: agencySchemas.AgencyTranslationsUpdateInput,
  storage: Storage,
  queryAgencyId?: string,
): Promise<agencySchemas.AgencyDetail> {
  const id = resolveAgencyId(user, queryAgencyId);
  requireAdmin(user, id);

  const updated = await replaceTranslations(
    id,
    input.translations.map((t) => ({
      locale: t.locale,
      description: t.description ?? null,
      metaTitle: t.metaTitle ?? null,
      metaDescription: t.metaDescription ?? null,
    })),
  );
  if (!updated) throw new NotFoundError("Agency not found");
  return toDetail(updated, storage);
}

export async function updateMyAgencySettings(
  user: AuthenticatedUser,
  input: agencySchemas.AgencySettingsUpdateInput,
  storage: Storage,
  queryAgencyId?: string,
): Promise<agencySchemas.AgencyDetail> {
  const id = resolveAgencyId(user, queryAgencyId);
  requireAdmin(user, id);

  const patch: Prisma.AgencySettingsUpdateInput = {};
  if (input.defaultCommissionPct !== undefined)
    patch.defaultCommissionPct = input.defaultCommissionPct;
  if (input.defaultIntroducerSharePct !== undefined)
    patch.defaultIntroducerSharePct = input.defaultIntroducerSharePct;
  if (input.viewingResponseDays !== undefined)
    patch.viewingResponseDays = input.viewingResponseDays;
  if (input.dealConfirmationDays !== undefined)
    patch.dealConfirmationDays = input.dealConfirmationDays;

  await upsertSettings(id, patch);

  const fresh = await getAgency(id);
  if (!fresh) throw new NotFoundError("Agency not found");
  return toDetail(fresh, storage);
}

// -------- DTO mapper --------

function normaliseEmptyToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v === "") return null;
  return v;
}

function toDetail(row: AgencyRow, storage: Storage): agencySchemas.AgencyDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    countryCode: row.countryCode,
    isPublic: row.isPublic,
    isActive: row.isActive,
    email: row.email,
    phone: row.phone,
    website: row.website,
    whatsappNumber: row.whatsappNumber,
    socialFacebook: row.socialFacebook,
    socialInstagram: row.socialInstagram,
    socialLinkedin: row.socialLinkedin,
    socialTwitter: row.socialTwitter,
    logoR2Key: row.logoR2Key,
    logoPublicUrl: row.logoR2Key ? storage.publicUrl(row.logoR2Key) : null,
    bannerR2Key: row.bannerR2Key,
    bannerPublicUrl: row.bannerR2Key ? storage.publicUrl(row.bannerR2Key) : null,
    heroImageR2Key: row.heroImageR2Key,
    heroImagePublicUrl: row.heroImageR2Key ? storage.publicUrl(row.heroImageR2Key) : null,
    translations: row.translations.map((t) => ({
      locale: t.locale as agencySchemas.AgencyTranslationT["locale"],
      description: t.description,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
    })),
    settings: row.settings
      ? {
          defaultCommissionPct: Number(row.settings.defaultCommissionPct),
          defaultIntroducerSharePct: Number(row.settings.defaultIntroducerSharePct),
          viewingResponseDays: row.settings.viewingResponseDays,
          dealConfirmationDays: row.settings.dealConfirmationDays,
        }
      : DEFAULT_SETTINGS,
  };
}
