import { z } from "zod";

/**
 * Super-admin curation schemas for PropertyTypeGroup + PropertyType.
 * PLAN §1 row 12 + Sprint 2.
 *
 * Translation editor surface: every entity has a 4-locale block; en
 * required, others optional and stored only when both name (and slug,
 * for groups) are present.
 *
 * Slug uniqueness: Prisma enforces `@@unique([locale, slug])` on group
 * translations and `@@unique([typeId, locale])` on type translations
 * (no slug field on PropertyTypeTranslation today — only the group has
 * a slug).
 */

const cuid = z.string().min(1);
const slugRe = /^[a-z0-9-]+$/;

export const adminLocaleSchema = z.enum(["en", "es", "de", "fr"]);

// ─── PropertyTypeGroup ───────────────────────────────────────────────────

const groupTranslationCreateSchema = z.object({
  locale: adminLocaleSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(slugRe, "lowercase a-z, 0-9, dashes"),
});

export const adminPropertyTypeGroupCreateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  translations: z.array(groupTranslationCreateSchema).min(1),
});

export const adminPropertyTypeGroupUpdateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  translations: z.array(groupTranslationCreateSchema).optional(),
});

export const adminPropertyTypeGroupSchema = z.object({
  id: cuid,
  position: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(
    z.object({
      locale: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
  ),
});

// ─── PropertyType ────────────────────────────────────────────────────────

export const iconKindSchema = z.enum(["LIBRARY", "CUSTOM"]);

const typeTranslationCreateSchema = z.object({
  locale: adminLocaleSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(slugRe, "lowercase a-z, 0-9, dashes"),
});

export const adminPropertyTypeCreateSchema = z.object({
  groupId: cuid,
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  iconKind: iconKindSchema.default("LIBRARY"),
  iconName: z.string().min(1).max(80).nullable().optional(),
  iconR2Key: z.string().min(1).max(300).nullable().optional(),
  translations: z.array(typeTranslationCreateSchema).min(1),
});

export const adminPropertyTypeUpdateSchema = z.object({
  groupId: cuid.optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  iconKind: iconKindSchema.optional(),
  iconName: z.string().max(80).nullable().optional(),
  iconR2Key: z.string().max(300).nullable().optional(),
  // Setting iconAdminOverrode locks AI suggestions until cleared. The api
  // sets it to true automatically when the admin changes iconName/iconR2Key,
  // so callers don't normally need to set it manually.
  iconAdminOverrode: z.boolean().optional(),
  translations: z.array(typeTranslationCreateSchema).optional(),
});

export const adminPropertyTypeSchema = z.object({
  id: cuid,
  groupId: cuid,
  position: z.number().int(),
  isActive: z.boolean(),
  iconKind: iconKindSchema,
  iconName: z.string().nullable(),
  iconR2Key: z.string().nullable(),
  iconAiSuggestedAt: z.string().datetime().nullable(),
  iconAdminOverrode: z.boolean(),
  translations: z.array(
    z.object({
      locale: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
  ),
});

// ─── List responses + reorder + AI suggester ─────────────────────────────

export const adminPropertyTypeGroupListResponseSchema = z.object({
  items: z.array(adminPropertyTypeGroupSchema),
});

export const adminPropertyTypeListResponseSchema = z.object({
  items: z.array(adminPropertyTypeSchema),
});

export const adminReorderRequestSchema = z.object({
  /** Stable id whose position is being updated. */
  id: cuid,
  /** New zero-based position. The api swaps with the existing occupant. */
  position: z.number().int().min(0),
});

export const suggestIconRequestSchema = z.object({
  /** Entity name in the default (English) locale. */
  name: z.string().min(1).max(120),
  /** Optional context to disambiguate (e.g. "PropertyType", "Feature"). */
  hint: z.string().max(120).optional(),
});

export const suggestIconResponseSchema = z.object({
  /** Lucide icon name in kebab-case, or null when no good match. */
  iconName: z.string().nullable(),
});

export type AdminPropertyTypeGroupCreate = z.infer<typeof adminPropertyTypeGroupCreateSchema>;
export type AdminPropertyTypeGroupUpdate = z.infer<typeof adminPropertyTypeGroupUpdateSchema>;
export type AdminPropertyTypeGroup = z.infer<typeof adminPropertyTypeGroupSchema>;
export type AdminPropertyTypeCreate = z.infer<typeof adminPropertyTypeCreateSchema>;
export type AdminPropertyTypeUpdate = z.infer<typeof adminPropertyTypeUpdateSchema>;
export type AdminPropertyType = z.infer<typeof adminPropertyTypeSchema>;
