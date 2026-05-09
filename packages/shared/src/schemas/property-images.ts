import { z } from "zod";

/**
 * PropertyImage attach / patch / delete schemas. PLAN §5.1, slice E.
 *
 * Attach is bulk: a single POST can attach N MediaObjects (matches the
 * upload widget's N-file flow). Cover, alt-text, and explicit position
 * are optional per-item; the service auto-assigns position to "next
 * available" when omitted.
 *
 * Cover-uniqueness (only one cover per property) is enforced in the
 * service layer because the schema has no partial unique index for it.
 */

const cuid = z.string().min(1);

export const attachPropertyImageItemSchema = z.object({
  mediaObjectId: cuid,
  altText: z.string().max(500).nullable().optional(),
  isCover: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const attachPropertyImagesRequestSchema = z.object({
  images: z.array(attachPropertyImageItemSchema).min(1).max(50),
});

export const patchPropertyImageRequestSchema = z
  .object({
    altText: z.string().max(500).nullable().optional(),
    isCover: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

export const propertyImageSchema = z.object({
  id: cuid,
  propertyId: cuid,
  mediaObjectId: cuid,
  altText: z.string().nullable(),
  position: z.number().int().min(0),
  isCover: z.boolean(),
  publicUrl: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});

export const attachPropertyImagesResponseSchema = z.object({
  images: z.array(propertyImageSchema),
});

export const patchPropertyImageResponseSchema = z.object({
  image: propertyImageSchema,
});

export const deletePropertyImageResponseSchema = z.object({
  ok: z.literal(true),
});

export type AttachPropertyImageItem = z.infer<typeof attachPropertyImageItemSchema>;
export type AttachPropertyImagesRequest = z.infer<typeof attachPropertyImagesRequestSchema>;
export type PatchPropertyImageRequest = z.infer<typeof patchPropertyImageRequestSchema>;
export type PropertyImageDto = z.infer<typeof propertyImageSchema>;
