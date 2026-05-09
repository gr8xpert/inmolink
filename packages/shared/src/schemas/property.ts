import { z } from "zod";
import { localeSchema } from "../locales";

/**
 * Wire-format Zod schemas for property CRUD.
 *
 * Sprint 1 — minimal CRUD. Media (images / floor plans / videos) is handled
 * via the separate upload flow (Sprint 1 next slice) and attached after the
 * property exists.
 */

// Enums kept in sync with packages/db/prisma/schema.prisma
export const propertyStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "UNDER_OFFER",
  "SOLD",
  "RENTED",
  "WITHDRAWN",
]);

export const propertyVisibilitySchema = z.enum(["PRIVATE", "SHARED", "PUBLIC"]);

export const transactionTypeSchema = z.enum(["SALE", "RENT", "SHORT_TERM"]);

export const propertySourceSchema = z.enum(["MANUAL", "KYERO", "RESALE_ONLINE", "GENERIC_XML"]);

export const priceTypeSchema = z.enum(["fixed", "poa", "from"]);

/** Per-locale text content for a property. */
export const propertyTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20_000),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes only"),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
});

/** Body of POST /api/dashboard/properties */
export const propertyCreateSchema = z.object({
  status: propertyStatusSchema.default("DRAFT"),
  visibility: propertyVisibilitySchema.default("SHARED"),

  transactionType: transactionTypeSchema,
  priceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).toUpperCase(),
  priceType: priceTypeSchema.default("fixed"),

  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  areaM2: z.number().int().nonnegative().nullable().optional(),
  plotM2: z.number().int().nonnegative().nullable().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),

  propertyTypeId: z.string().min(1),
  locationId: z.string().min(1),

  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  addressLine: z.string().max(300).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),

  virtualTourUrl: z.string().url().nullable().optional(),

  featureIds: z.array(z.string()).default([]),

  // At least one translation required on create. Default-locale translation
  // is what surfaces when a requested locale is missing.
  translations: z.array(propertyTranslationSchema).min(1),
});

export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

/**
 * PATCH body — every field optional. Translations replace by (propertyId, locale).
 * To remove a feature, omit it from `featureIds` (provided list replaces existing).
 */
export const propertyUpdateSchema = propertyCreateSchema.partial().extend({
  // Carry list of fields to lock / unlock against feed re-imports
  // (PLAN §1 row 16). Omit `lockedFields` to leave unchanged.
  lockedFields: z.array(z.string()).optional(),
});

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

/** Filters for GET /api/dashboard/properties */
export const propertyListQuerySchema = z.object({
  status: propertyStatusSchema.optional(),
  visibility: propertyVisibilitySchema.optional(),
  transactionType: transactionTypeSchema.optional(),
  propertyTypeId: z.string().optional(),
  locationId: z.string().optional(),
  ownerUserId: z.string().optional(),
  ownerAgencyId: z.string().optional(),
  q: z.string().max(200).optional(),
  // Cursor pagination per PLAN §11.2 — never OFFSET on hot lists.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;

/** Item shape returned by list + get endpoints. */
export const propertyListItemSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  ownerAgencyId: z.string(),
  status: propertyStatusSchema,
  visibility: propertyVisibilitySchema,
  transactionType: transactionTypeSchema,
  priceCents: z.number(),
  currency: z.string(),
  priceType: priceTypeSchema,
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  areaM2: z.number().nullable(),
  propertyTypeId: z.string(),
  locationId: z.string(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const propertyListResponseSchema = z.object({
  items: z.array(propertyListItemSchema),
  nextCursor: z.string().nullable(),
});

export const propertyDetailSchema = propertyListItemSchema.extend({
  source: propertySourceSchema,
  externalRef: z.string().nullable(),
  plotM2: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  addressLine: z.string().nullable(),
  postcode: z.string().nullable(),
  virtualTourUrl: z.string().nullable(),
  lockedFields: z.array(z.string()),
  version: z.number(),
  translations: z.array(propertyTranslationSchema),
  featureIds: z.array(z.string()),
});

export type PropertyDetail = z.infer<typeof propertyDetailSchema>;
