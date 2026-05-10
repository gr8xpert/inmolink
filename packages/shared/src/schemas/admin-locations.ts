import { z } from "zod";

/**
 * Super-admin curation schemas for Location (4-level tree).
 * LocationGroup curation lands in slice 2.C.2 — m2m membership editor
 * is a separate UX from the parent/child tree.
 *
 * Hierarchy: COUNTRY → REGION → CITY → AREA. Each Location has a
 * `parentId` (null for COUNTRY) and a `position` scoped to its parent.
 *
 * Translations are SEO-relevant — each carries slug + metaTitle +
 * metaDescription (used by the public marketplace location landing pages
 * planned for Sprint 3). Slug uniqueness is enforced by the schema:
 * `@@unique([locale, slug])` on LocationTranslation, so two locations
 * cannot share a slug within the same locale.
 */

const cuid = z.string().min(1);
const slugRe = /^[a-z0-9-]+$/;

export const locationLevelSchema = z.enum(["COUNTRY", "REGION", "CITY", "AREA"]);
export const adminLocationLocaleSchema = z.enum(["en", "es", "de", "fr"]);

export const VALID_CHILD_LEVEL: Record<
  z.infer<typeof locationLevelSchema>,
  z.infer<typeof locationLevelSchema> | null
> = {
  COUNTRY: "REGION",
  REGION: "CITY",
  CITY: "AREA",
  AREA: null, // leaf
};

const translationSchema = z.object({
  locale: adminLocationLocaleSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(slugRe, "lowercase a-z, 0-9, dashes"),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
});

export const adminLocationCreateSchema = z.object({
  level: locationLevelSchema,
  parentId: cuid.nullable().optional(),
  countryCode: z.string().length(2).toUpperCase(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  translations: z.array(translationSchema).min(1),
});

export const adminLocationUpdateSchema = z.object({
  // `level` and `parentId` are immutable post-creation — moving a node
  // across levels requires care (children's levels become invalid). If a
  // future use-case needs it, add a dedicated `move` endpoint with
  // cascade re-leveling rather than allowing it via PATCH.
  countryCode: z.string().length(2).toUpperCase().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  translations: z.array(translationSchema).optional(),
});

export const adminLocationSchema = z.object({
  id: cuid,
  level: locationLevelSchema,
  parentId: cuid.nullable(),
  countryCode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  position: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(
    z.object({
      locale: z.string(),
      name: z.string(),
      slug: z.string(),
      metaTitle: z.string().nullable(),
      metaDescription: z.string().nullable(),
    }),
  ),
  /** Child count — handy for tree-view chevrons + 409-on-delete preview. */
  childCount: z.number().int(),
});

export const adminLocationListResponseSchema = z.object({
  /** Flat list; client builds the tree by parentId. */
  items: z.array(adminLocationSchema),
});

export type AdminLocationCreate = z.infer<typeof adminLocationCreateSchema>;
export type AdminLocationUpdate = z.infer<typeof adminLocationUpdateSchema>;
export type AdminLocation = z.infer<typeof adminLocationSchema>;
export type LocationLevel = z.infer<typeof locationLevelSchema>;
