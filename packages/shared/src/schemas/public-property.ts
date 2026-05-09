import { z } from "zod";

/**
 * Public marketplace schemas — what anonymous browsers see. Slice G.
 *
 * Differences from the dashboard schemas:
 *  - `addressLine` and `postcode` are stripped (city-level only) so we
 *    never leak the exact address of a property. Buyers contact the
 *    agency for the precise location post-introduction.
 *  - Agency badge data (name + slug + logoR2Key) is denormalised into the
 *    response so the public page renders the badge without a join request.
 *  - `ownerUserId` and `ownerAgencyId` are omitted — they're internal.
 *  - Only one translation is returned (the requested locale, falling back
 *    to en, then first available); the page never needs the full set.
 */

const cuid = z.string().min(1);

export const publicPropertyTranslationSchema = z.object({
  locale: z.string(),
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
});

export const publicAgencyBadgeSchema = z.object({
  id: cuid,
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});

export const publicPropertyDetailSchema = z.object({
  id: cuid,
  // Mirrors the Prisma PropertyStatus enum. The public read filter only
  // surfaces ACTIVE today, but the schema is permissive so we don't have
  // to bump it again the moment the api starts returning more states.
  status: z.enum(["DRAFT", "ACTIVE", "UNDER_OFFER", "SOLD", "RENTED", "WITHDRAWN"]),
  transactionType: z.enum(["SALE", "RENT", "SHORT_TERM"]),
  priceCents: z.number(),
  currency: z.string(),
  priceType: z.enum(["fixed", "poa", "from"]),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  areaM2: z.number().nullable(),
  plotM2: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  propertyTypeId: cuid,
  locationId: cuid,
  // Coords are publishable only at city resolution — exact lat/long not
  // surfaced to the public detail page (privacy + scraping defence).
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  virtualTourUrl: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  translation: publicPropertyTranslationSchema,
  agency: publicAgencyBadgeSchema,
});

export const publicPropertyImageSchema = z.object({
  id: cuid,
  position: z.number().int(),
  isCover: z.boolean(),
  altText: z.string().nullable(),
  publicUrl: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

export const publicPropertyImagesResponseSchema = z.object({
  images: z.array(publicPropertyImageSchema),
});

export type PublicPropertyDetail = z.infer<typeof publicPropertyDetailSchema>;
export type PublicPropertyImage = z.infer<typeof publicPropertyImageSchema>;
export type PublicAgencyBadge = z.infer<typeof publicAgencyBadgeSchema>;
