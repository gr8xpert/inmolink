import { z } from "zod";
import { localeSchema } from "../locales";
import { userRoleSchema } from "../permissions";

/**
 * Anonymous-read shapes for `/agency/[slug]` and `/agent/[slug]` (PLAN §8).
 *
 * Hard filters baked into the api routes (defense-in-depth at the read
 * layer):
 *   - Agency: `isPublic = true && isActive = true`
 *   - Agent:  `publicProfileEnabled = true && isActive = true` AND owning
 *             agency satisfies the agency rule above
 *   - Property cards: `status = ACTIVE && visibility = PUBLIC && deletedAt = null`
 */

const cardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  transactionType: z.enum(["SALE", "RENT", "SHORT_TERM"]),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  priceType: z.enum(["fixed", "poa", "from"]),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  areaM2: z.number().int().nullable(),
  publishedAt: z.string().datetime().nullable(),
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
});

export const publicAgencyMemberSchema = z.object({
  slug: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: userRoleSchema,
  bio: z.string().nullable(),
  languagesSpoken: z.array(z.string()),
  photoPublicUrl: z.string().nullable(),
});

export const publicAgencyDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  countryCode: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  socialFacebook: z.string().nullable(),
  socialInstagram: z.string().nullable(),
  socialLinkedin: z.string().nullable(),
  socialTwitter: z.string().nullable(),
  logoPublicUrl: z.string().nullable(),
  bannerPublicUrl: z.string().nullable(),
  heroImagePublicUrl: z.string().nullable(),
  /** Description / meta fall back en → first available, like properties. */
  translation: z.object({
    locale: localeSchema,
    description: z.string().nullable(),
    metaTitle: z.string().nullable(),
    metaDescription: z.string().nullable(),
  }),
  members: z.array(publicAgencyMemberSchema),
  totalProperties: z.number().int().nonnegative(),
  /** First N cards rendered inline; "see all" links to /search filter. */
  properties: z.array(cardSchema),
});

export const publicAgentDetailSchema = z.object({
  slug: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: userRoleSchema,
  bio: z.string().nullable(),
  languagesSpoken: z.array(z.string()),
  photoPublicUrl: z.string().nullable(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  agency: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    logoPublicUrl: z.string().nullable(),
  }),
  totalProperties: z.number().int().nonnegative(),
  properties: z.array(cardSchema),
});

export const publicProfileListQuerySchema = z.object({
  locale: localeSchema.default("en"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export const publicProfileListResponseSchema = z.object({
  items: z.array(cardSchema),
  nextCursor: z.string().nullable(),
});

export type PublicAgencyDetail = z.infer<typeof publicAgencyDetailSchema>;
export type PublicAgentDetail = z.infer<typeof publicAgentDetailSchema>;
export type PublicProfileListQuery = z.infer<typeof publicProfileListQuerySchema>;
export type PublicProfileListResponse = z.infer<typeof publicProfileListResponseSchema>;
export type PublicAgencyMember = z.infer<typeof publicAgencyMemberSchema>;
export type PropertyCard = z.infer<typeof cardSchema>;
