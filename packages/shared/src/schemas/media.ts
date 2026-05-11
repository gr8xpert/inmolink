import { z } from "zod";

/**
 * Variant pipeline contract shared between the api producer and the worker
 * consumer. PLAN §5 / §5.1 / ADR 0002.
 *
 *   thumb   → 200×200    (list cards, dashboard)
 *   small   → 480×480    (mobile gallery, hero blur-up)
 *   medium  → 1080×1080  (desktop gallery, public detail)
 *   large   → 1920×1920  (lightbox, og:image fallback)
 *
 * All output is WebP (modern browsers + email clients via mime sniff). One
 * extra JPEG variant is generated at "large" for the cover image only — used
 * as og:image for crawlers that still trip on WebP. PNG/AVIF dropped per §5.
 *
 * Pipeline must be deterministic: identical input + identical pipelineVersion
 * MUST produce byte-identical output (otherwise variant dedup breaks).
 * Bump PIPELINE_VERSION when encoder settings change.
 */

export const PIPELINE_VERSION = 1;

export const VARIANT_SIZES = {
  thumb: { maxDim: 200 },
  small: { maxDim: 480 },
  medium: { maxDim: 1080 },
  large: { maxDim: 1920 },
} as const;

export const variantSizeNameSchema = z.enum(["thumb", "small", "medium", "large"]);
export type VariantSizeName = z.infer<typeof variantSizeNameSchema>;

export const variantFormatSchema = z.enum(["webp", "jpeg"]);
export type VariantFormat = z.infer<typeof variantFormatSchema>;

/**
 * Sizes generated EAGERLY on /uploads/register (cheap + always needed).
 * Other sizes/formats are lazy-resolved on first request.
 */
export const EAGER_VARIANTS: ReadonlyArray<{
  sizeName: VariantSizeName;
  format: VariantFormat;
}> = [
  { sizeName: "thumb", format: "webp" },
  { sizeName: "medium", format: "webp" },
];

export const imageVariantJobSchema = z.object({
  sourceMediaObjectId: z.string().min(1),
  sourceHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  sizeName: variantSizeNameSchema,
  format: variantFormatSchema,
  pipelineVersion: z.number().int().positive(),
});

export type ImageVariantJob = z.infer<typeof imageVariantJobSchema>;

/**
 * Stable jobId used for BullMQ deduplication. Same logical work → same id →
 * BullMQ silently drops the duplicate add().
 *
 * Separator is `-` (not `:`) — BullMQ v5 rejects custom job IDs containing
 * `:` because Redis uses it as the internal key separator.
 */
export function imageVariantJobId(args: {
  sourceHash: string;
  sizeName: VariantSizeName;
  format: VariantFormat;
  pipelineVersion: number;
}): string {
  return `iv-${args.sourceHash}-${args.sizeName}-${args.format}-v${args.pipelineVersion}`;
}
