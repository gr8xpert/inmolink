import { prisma } from "@inmolink/db";
import { mediaSchemas } from "@inmolink/shared";
import { type Storage, variantKeyFromHash } from "@inmolink/storage";
import type { Queue } from "bullmq";

/**
 * Lazy variant resolution. PLAN §5 / state-file slice D.
 *
 * Eager set: thumb + medium WebP (generated on /uploads/register).
 * Lazy set:  small + large WebP, plus the cover-image JPEG fallback at large.
 *
 * Callers (e.g. the public marketplace property page) ask for a specific
 * (size × format) tuple. If the variant exists it's returned ready. If not,
 * we enqueue the job and return `pending` so the caller can fall back to
 * the next-smaller eager size while the worker catches up.
 *
 * Idempotent — BullMQ dedups by jobId.
 */

export type ResolvedVariant = {
  status: "ready";
  hash: string;
  publicUrl: string;
  width: number;
  height: number;
  bytes: number;
};

export type PendingVariant = {
  status: "pending";
};

export type VariantResolution = ResolvedVariant | PendingVariant;

export async function resolveOrEnqueueVariant(
  deps: {
    storage: Storage;
    imageVariantQueue: Queue;
  },
  args: {
    mediaObjectId: string;
    sizeName: mediaSchemas.VariantSizeName;
    format: mediaSchemas.VariantFormat;
  },
): Promise<VariantResolution> {
  const v = mediaSchemas.PIPELINE_VERSION;

  const existing = await prisma.mediaVariant.findFirst({
    where: {
      sourceMediaObjectId: args.mediaObjectId,
      sizeName: args.sizeName,
      format: args.format,
      pipelineVersion: v,
    },
    select: { hash: true, width: true, height: true, bytes: true },
  });

  if (existing) {
    return {
      status: "ready",
      hash: existing.hash,
      publicUrl: deps.storage.publicUrl(variantKeyFromHash(existing.hash)),
      width: existing.width,
      height: existing.height,
      bytes: existing.bytes,
    };
  }

  // Need the source hash to build the deterministic jobId — fetch from
  // MediaObject. Caller is expected to know the id is real (e.g. from
  // PropertyImage join), so a missing row is a 404 the caller surfaces.
  const source = await prisma.mediaObject.findUnique({
    where: { id: args.mediaObjectId },
    select: { hash: true, mimeType: true },
  });
  if (!source) return { status: "pending" };
  if (!source.mimeType.startsWith("image/")) return { status: "pending" };

  await deps.imageVariantQueue.add(
    `${args.sizeName}-${args.format}`,
    {
      sourceMediaObjectId: args.mediaObjectId,
      sourceHash: source.hash,
      sizeName: args.sizeName,
      format: args.format,
      pipelineVersion: v,
    },
    {
      jobId: mediaSchemas.imageVariantJobId({
        sourceHash: source.hash,
        sizeName: args.sizeName,
        format: args.format,
        pipelineVersion: v,
      }),
    },
  );

  return { status: "pending" };
}
