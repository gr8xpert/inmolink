import { z } from "zod";

/**
 * Super-admin curation of feed-source labels → PropertyType (PLAN §11.5).
 * The same raw label can map differently across connectors so the unique
 * key is `(kind, sourceLabel)` where `sourceLabel` is canonicalised
 * (trimmed, lower-cased) by the api before persistence.
 */

const cuid = z.string().min(1);

export const feedConnectorKindSchema = z.enum(["KYERO", "RESALE_ONLINE", "GENERIC_XML"]);

export const adminFeedTypeMapCreateSchema = z.object({
  kind: feedConnectorKindSchema,
  sourceLabel: z.string().min(1).max(120),
  propertyTypeId: cuid,
});

export const adminFeedTypeMapUpdateSchema = z.object({
  propertyTypeId: cuid.optional(),
  sourceLabel: z.string().min(1).max(120).optional(),
});

export const adminFeedTypeMapSchema = z.object({
  id: cuid,
  kind: feedConnectorKindSchema,
  sourceLabel: z.string(),
  propertyTypeId: cuid,
  /** Convenience: the resolved PropertyType's first translation name. */
  propertyTypeName: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const adminFeedTypeMapListQuerySchema = z.object({
  kind: feedConnectorKindSchema.optional(),
  q: z.string().max(120).optional(),
});

export const adminFeedTypeMapListResponseSchema = z.object({
  items: z.array(adminFeedTypeMapSchema),
});

export type AdminFeedTypeMapCreate = z.infer<typeof adminFeedTypeMapCreateSchema>;
export type AdminFeedTypeMapUpdate = z.infer<typeof adminFeedTypeMapUpdateSchema>;
export type AdminFeedTypeMap = z.infer<typeof adminFeedTypeMapSchema>;
