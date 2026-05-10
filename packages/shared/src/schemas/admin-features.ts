import { z } from "zod";

/**
 * Super-admin curation schemas for FeatureGroup + Feature.
 * Mirror of admin-property-types but:
 *  - No slug on translations (FeatureGroupTranslation/FeatureTranslation
 *    are unique on [parent, locale] only — no [locale, slug] uniqueness)
 *  - No iconKind / iconR2Key on Feature (Lucide library names only per
 *    PLAN row 12).
 */

const cuid = z.string().min(1);

export const adminLocaleSchema = z.enum(["en", "es", "de", "fr"]);

// ─── FeatureGroup ────────────────────────────────────────────────────────

const groupTranslationSchema = z.object({
  locale: adminLocaleSchema,
  name: z.string().min(1).max(120),
});

export const adminFeatureGroupCreateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  translations: z.array(groupTranslationSchema).min(1),
});

export const adminFeatureGroupUpdateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  translations: z.array(groupTranslationSchema).optional(),
});

export const adminFeatureGroupSchema = z.object({
  id: cuid,
  position: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(z.object({ locale: z.string(), name: z.string() })),
});

// ─── Feature ────────────────────────────────────────────────────────────

const featureTranslationSchema = z.object({
  locale: adminLocaleSchema,
  name: z.string().min(1).max(120),
});

export const adminFeatureCreateSchema = z.object({
  groupId: cuid,
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  iconName: z.string().min(1).max(80).nullable().optional(),
  translations: z.array(featureTranslationSchema).min(1),
});

export const adminFeatureUpdateSchema = z.object({
  groupId: cuid.optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  iconName: z.string().max(80).nullable().optional(),
  // Setting this clears the AI-override lock so future suggestions are
  // free to overwrite. Normally toggled implicitly by the api when iconName
  // changes; explicit override exposed for tests.
  iconAdminOverrode: z.boolean().optional(),
  translations: z.array(featureTranslationSchema).optional(),
});

export const adminFeatureSchema = z.object({
  id: cuid,
  groupId: cuid,
  position: z.number().int(),
  isActive: z.boolean(),
  iconName: z.string().nullable(),
  iconAiSuggestedAt: z.string().datetime().nullable(),
  iconAdminOverrode: z.boolean(),
  translations: z.array(z.object({ locale: z.string(), name: z.string() })),
});

export const adminFeatureGroupListResponseSchema = z.object({
  items: z.array(adminFeatureGroupSchema),
});

export const adminFeatureListResponseSchema = z.object({
  items: z.array(adminFeatureSchema),
});

/** Drag-and-drop reorder for groups — caller sends the full ordered ids
 *  list; api rewrites positions 0..n-1 atomically. */
export const adminReorderAllFeatureGroupsRequestSchema = z.object({
  ids: z.array(cuid).min(1),
});

/** Drag-and-drop reorder for features within a group. */
export const adminReorderAllFeaturesRequestSchema = z.object({
  groupId: cuid,
  ids: z.array(cuid).min(1),
});

export const suggestFeatureIconRequestSchema = z.object({
  name: z.string().min(1).max(120),
  hint: z.string().max(120).optional(),
});

export const suggestFeatureIconResponseSchema = z.object({
  iconName: z.string().nullable(),
});

export type AdminFeatureGroupCreate = z.infer<typeof adminFeatureGroupCreateSchema>;
export type AdminFeatureGroupUpdate = z.infer<typeof adminFeatureGroupUpdateSchema>;
export type AdminFeatureGroup = z.infer<typeof adminFeatureGroupSchema>;
export type AdminFeatureCreate = z.infer<typeof adminFeatureCreateSchema>;
export type AdminFeatureUpdate = z.infer<typeof adminFeatureUpdateSchema>;
export type AdminFeature = z.infer<typeof adminFeatureSchema>;
