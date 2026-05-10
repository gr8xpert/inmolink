import { mediaSchemas } from "@inmolink/shared";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

/**
 * BullMQ queue producers used by the api. Workers consume these in
 * apps/worker. Queue names are duplicated in apps/worker/src/queues.ts —
 * keep both in sync (small enough not to warrant a shared package yet).
 */

export const QUEUE_NAMES = {
  IMAGE_VARIANT: "image-variant",
  SITEMAP_GENERATE: "sitemap-generate",
} as const;

let imageVariantQueueSingleton: Queue | null = null;
let sitemapQueueSingleton: Queue | null = null;

/**
 * Lazy singleton — first call wires the queue against the shared Redis
 * connection from app.ts. The shared connection has
 * `maxRetriesPerRequest: null` set per BullMQ's requirement.
 */
export function getImageVariantQueue(connection: Redis): Queue {
  if (!imageVariantQueueSingleton) {
    imageVariantQueueSingleton = new Queue(QUEUE_NAMES.IMAGE_VARIANT, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        // Keep last hour of completed jobs (debug) + last 200 failures (DLQ-lite).
        removeOnComplete: { age: 3600 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return imageVariantQueueSingleton;
}

/**
 * Producer for ad-hoc sitemap regenerations. The worker also runs a daily
 * cron-driven generation; this surface is for the super-admin "regenerate
 * now" button (PLAN §11.13).
 */
export function getSitemapQueue(connection: Redis): Queue {
  if (!sitemapQueueSingleton) {
    sitemapQueueSingleton = new Queue(QUEUE_NAMES.SITEMAP_GENERATE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return sitemapQueueSingleton;
}

export async function enqueueSitemapNow(queue: Queue, requestedBy: string): Promise<string> {
  const job = await queue.add(
    "manual",
    { trigger: "manual", requestedBy, requestedAt: new Date().toISOString() },
    // Coalesce concurrent manual triggers — same key → one job.
    { jobId: `sitemap:manual:${Math.floor(Date.now() / 60_000)}` },
  );
  return job.id ?? "";
}

export async function closeQueues(): Promise<void> {
  if (imageVariantQueueSingleton) {
    await imageVariantQueueSingleton.close();
    imageVariantQueueSingleton = null;
  }
  if (sitemapQueueSingleton) {
    await sitemapQueueSingleton.close();
    sitemapQueueSingleton = null;
  }
}

/**
 * Enqueue the eager variant set (thumb + medium WebP) for a freshly
 * registered MediaObject. Skipped for non-image MIME types — videos and
 * floor-plan PDFs land their own pipelines later.
 *
 * Idempotent: jobIds are deterministic (`iv:<sourceHash>:<size>:<format>:v<n>`).
 * Calling this twice for the same MediaObject is a no-op.
 */
export async function enqueueEagerImageVariants(
  queue: Queue,
  args: { mediaObjectId: string; sourceHash: string; mimeType: string },
): Promise<void> {
  if (!args.mimeType.startsWith("image/")) return;

  const v = mediaSchemas.PIPELINE_VERSION;
  await Promise.all(
    mediaSchemas.EAGER_VARIANTS.map(({ sizeName, format }) =>
      queue.add(
        `${sizeName}-${format}`,
        {
          sourceMediaObjectId: args.mediaObjectId,
          sourceHash: args.sourceHash,
          sizeName,
          format,
          pipelineVersion: v,
        },
        {
          jobId: mediaSchemas.imageVariantJobId({
            sourceHash: args.sourceHash,
            sizeName,
            format,
            pipelineVersion: v,
          }),
        },
      ),
    ),
  );
}
