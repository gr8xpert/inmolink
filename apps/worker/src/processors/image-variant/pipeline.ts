import { createHash } from "node:crypto";
import { mediaSchemas } from "@inmolink/shared";
import sharp from "sharp";

const { VARIANT_SIZES } = mediaSchemas;

/**
 * Encoder settings — bumping any of these requires bumping
 * mediaSchemas.PIPELINE_VERSION so old variants stay valid until orphaned.
 */
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 4;
const JPEG_QUALITY = 85;

export type VariantOutput = {
  buffer: Buffer;
  hash: string;
  bytes: number;
  width: number;
  height: number;
};

/**
 * Pure transform: source bytes → encoded variant bytes + sha256.
 *
 * - Auto-orients via EXIF before resize (sharp 0.33 emits the rotation in the
 *   pipeline by default; calling .rotate() with no args preserves that).
 * - Resize is `inside` + `withoutEnlargement` so we never upscale and aspect
 *   ratio is preserved (the result fits within sizeName.maxDim × maxDim).
 * - Identical input + identical version → byte-identical output. Verified by
 *   sharp's deterministic encoder defaults; do not introduce time- or
 *   random-based options here without bumping PIPELINE_VERSION.
 */
export async function generateVariant(
  source: Buffer,
  sizeName: mediaSchemas.VariantSizeName,
  format: mediaSchemas.VariantFormat,
): Promise<VariantOutput> {
  const { maxDim } = VARIANT_SIZES[sizeName];

  let pipeline = sharp(source, { failOn: "error" })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });

  if (format === "webp") {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT });
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex");

  return {
    buffer: data,
    hash,
    bytes: data.byteLength,
    width: info.width,
    height: info.height,
  };
}

export function variantContentType(format: mediaSchemas.VariantFormat): string {
  return format === "webp" ? "image/webp" : "image/jpeg";
}
