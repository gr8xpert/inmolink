import { z } from "zod";

/**
 * Super-admin curation schemas for LocationGroup (m2m collection of
 * Locations). PLAN §1 row 22 — used for editorial bundles like
 * "Costa del Sol" that aggregate cities outside the strict
 * COUNTRY → REGION → CITY → AREA tree.
 *
 * The group itself behaves like PropertyTypeGroup/FeatureGroup
 * (translations + position + isActive). Membership is a separate
 * m2m endpoint (`/members/*`) — not a translations-array property —
 * because the picker UX is fundamentally different from the inline
 * translation editor.
 */

const cuid = z.string().min(1);
const slugRe = /^[a-z0-9-]+$/;

export const adminLocaleSchema = z.enum(["en", "es", "de", "fr"]);

const translationSchema = z.object({
  locale: adminLocaleSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(slugRe, "lowercase a-z, 0-9, dashes"),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
});

export const adminLocationGroupCreateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  translations: z.array(translationSchema).min(1),
});

export const adminLocationGroupUpdateSchema = z.object({
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  translations: z.array(translationSchema).optional(),
});

/** A member as it appears inside a group's response — denormalises the
 *  Location's en name + level + countryCode for a one-shot picker UX. */
export const adminLocationGroupMemberSchema = z.object({
  locationId: cuid,
  position: z.number().int(),
  // Embedded location summary (en name preferred, falls back to first
  // available — matches taxonomyRoutes' name-resolution rule).
  name: z.string(),
  level: z.enum(["COUNTRY", "REGION", "CITY", "AREA"]),
  countryCode: z.string(),
});

export const adminLocationGroupSchema = z.object({
  id: cuid,
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
  members: z.array(adminLocationGroupMemberSchema),
});

export const adminLocationGroupListResponseSchema = z.object({
  items: z.array(adminLocationGroupSchema),
});

// Membership ops are separate from group PATCH: a typical edit only
// touches a single member, so wholesale-replace would be wasteful.

export const addMemberRequestSchema = z.object({
  locationId: cuid,
  /** When omitted, the api appends to the end of the member list. */
  position: z.number().int().min(0).optional(),
});

export const reorderMemberRequestSchema = z.object({
  locationId: cuid,
  position: z.number().int().min(0),
});

export type AdminLocationGroupCreate = z.infer<typeof adminLocationGroupCreateSchema>;
export type AdminLocationGroupUpdate = z.infer<typeof adminLocationGroupUpdateSchema>;
export type AdminLocationGroup = z.infer<typeof adminLocationGroupSchema>;
export type AdminLocationGroupMember = z.infer<typeof adminLocationGroupMemberSchema>;
