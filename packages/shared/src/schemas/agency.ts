import { z } from "zod";
import { localeSchema } from "../locales";

/**
 * Wire-format schemas for `/api/dashboard/agency` — the single agency the
 * signed-in user belongs to. AGENCY_ADMIN-gated. SUPER_ADMIN can read/write
 * any agency by passing ?agencyId= when needed (deferred — current admin
 * surface curates taxonomy, not agencies).
 */

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const URL_OR_EMPTY = z.string().url().nullable().optional().or(z.literal(""));

export const agencyDetailsSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(2).max(80).regex(SLUG_REGEX, "lowercase alphanumeric with dashes only"),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1).max(40).nullable().optional(),
  website: URL_OR_EMPTY,
  whatsappNumber: z.string().min(1).max(40).nullable().optional(),
  socialFacebook: URL_OR_EMPTY,
  socialInstagram: URL_OR_EMPTY,
  socialLinkedin: URL_OR_EMPTY,
  socialTwitter: URL_OR_EMPTY,
  countryCode: z.string().length(2).toUpperCase(),
  isPublic: z.boolean(),
});

export const agencyDetailsUpdateSchema = agencyDetailsSchema.partial();

export const agencyBrandingUpdateSchema = z.object({
  logoR2Key: z.string().min(1).max(255).nullable().optional(),
  bannerR2Key: z.string().min(1).max(255).nullable().optional(),
  heroImageR2Key: z.string().min(1).max(255).nullable().optional(),
});

export const agencyTranslationSchema = z.object({
  locale: localeSchema,
  description: z.string().max(20_000).nullable().optional(),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
});

export const agencyTranslationsUpdateSchema = z.object({
  translations: z.array(agencyTranslationSchema).max(10),
});

export const agencySettingsSchema = z.object({
  defaultCommissionPct: z.number().min(0).max(100),
  defaultIntroducerSharePct: z.number().min(0).max(100),
  viewingResponseDays: z.number().int().min(1).max(60),
  dealConfirmationDays: z.number().int().min(1).max(120),
});

export const agencySettingsUpdateSchema = agencySettingsSchema.partial();

export const agencyDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  countryCode: z.string(),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  socialFacebook: z.string().nullable(),
  socialInstagram: z.string().nullable(),
  socialLinkedin: z.string().nullable(),
  socialTwitter: z.string().nullable(),
  logoR2Key: z.string().nullable(),
  logoPublicUrl: z.string().nullable(),
  bannerR2Key: z.string().nullable(),
  bannerPublicUrl: z.string().nullable(),
  heroImageR2Key: z.string().nullable(),
  heroImagePublicUrl: z.string().nullable(),
  translations: z.array(agencyTranslationSchema),
  settings: agencySettingsSchema,
});

export type AgencyDetailsInput = z.infer<typeof agencyDetailsSchema>;
export type AgencyDetailsUpdateInput = z.infer<typeof agencyDetailsUpdateSchema>;
export type AgencyBrandingUpdateInput = z.infer<typeof agencyBrandingUpdateSchema>;
export type AgencyTranslationT = z.infer<typeof agencyTranslationSchema>;
export type AgencyTranslationsUpdateInput = z.infer<typeof agencyTranslationsUpdateSchema>;
export type AgencySettingsT = z.infer<typeof agencySettingsSchema>;
export type AgencySettingsUpdateInput = z.infer<typeof agencySettingsUpdateSchema>;
export type AgencyDetail = z.infer<typeof agencyDetailSchema>;
