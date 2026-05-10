import { z } from "zod";

/**
 * Upload pipeline schemas. PLAN §5.1 / ADR 0002.
 *
 * Two-step flow:
 *   1. POST /api/uploads/sign with a list of {hash, mimeType, bytes, ...}.
 *      Server returns existing mediaObjectId for known hashes (dedup hit)
 *      or {uploadUrl, key} for novel ones.
 *   2. Browser PUTs to uploadUrl, then POSTs /api/uploads/register with
 *      the same metadata. Server fetches the bytes back, verifies hash
 *      matches, creates MediaObject (if needed) with refCount=0 and a
 *      24-hour scheduledDeleteAt.
 *
 * Step 3 (attach to PropertyImage / FloorPlan / Video) is its own endpoint.
 */

// SHA-256 hex (lowercase, exactly 64 chars).
const sha256Hex = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/, "Hash must be lowercase 64-char hex (SHA-256)");

const allowedMimeTypes = [
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
  // Vector — used by the PropertyType admin's custom-icon flow.
  // Always rendered via `<img src>` (not inline) so embedded scripts can't
  // execute; size is capped tighter at the route layer.
  "image/svg+xml",
  // Floor plans
  "application/pdf",
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const mediaMimeTypeSchema = z.enum(allowedMimeTypes);
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;

export const signUploadFileSchema = z.object({
  hash: sha256Hex,
  mimeType: mediaMimeTypeSchema,
  bytes: z
    .number()
    .int()
    .positive()
    .max(500 * 1024 * 1024), // 500 MB hard cap
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSec: z.number().positive().nullable().optional(),
});

export const signUploadRequestSchema = z.object({
  files: z.array(signUploadFileSchema).min(1).max(50),
});

export const signUploadResultSchema = z.discriminatedUnion("status", [
  z.object({
    hash: sha256Hex,
    status: z.literal("exists"),
    mediaObjectId: z.string(),
    /** Content-addressed storage key for the existing MediaObject. Returned
     *  alongside publicUrl so callers that want to bind the file to a
     *  durable column (e.g. PropertyType.iconR2Key) don't have to re-resolve
     *  the key from the URL. */
    key: z.string(),
    publicUrl: z.string(),
  }),
  z.object({
    hash: sha256Hex,
    status: z.literal("upload"),
    uploadUrl: z.string().url(),
    key: z.string(),
    expiresAt: z.string().datetime(),
    requiredHeaders: z.record(z.string()),
  }),
]);

export const signUploadResponseSchema = z.object({
  results: z.array(signUploadResultSchema),
});

export type SignUploadFile = z.infer<typeof signUploadFileSchema>;
export type SignUploadResult = z.infer<typeof signUploadResultSchema>;

export const registerUploadFileSchema = z.object({
  hash: sha256Hex,
  // Server-recomputed if missing; client may pass for sanity but server is
  // authoritative.
  mimeType: mediaMimeTypeSchema,
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSec: z.number().positive().nullable().optional(),
});

export const registerUploadRequestSchema = z.object({
  uploads: z.array(registerUploadFileSchema).min(1).max(50),
});

export const registerUploadResultSchema = z.object({
  hash: sha256Hex,
  mediaObjectId: z.string(),
  publicUrl: z.string(),
  bytes: z.number().int().positive(),
});

export const registerUploadResponseSchema = z.object({
  results: z.array(registerUploadResultSchema),
});

export type RegisterUploadFile = z.infer<typeof registerUploadFileSchema>;
export type RegisterUploadResult = z.infer<typeof registerUploadResultSchema>;
