import { prisma } from "@inmolink/db";
import { type Storage, variantKeyFromHash } from "@inmolink/storage";
import type { Job } from "bullmq";
import type { Logger } from "pino";

/**
 * MEDIA_CLEANUP processor. PLAN §5.1 / §11.1, slice E.
 *
 * Runs daily (BullMQ scheduler in worker.ts). Two passes per tick:
 *
 *   Pass 1 — MediaObject orphans (refCount<=0 + scheduledDeleteAt past).
 *     For each row:
 *       a. Decrement refCount on every MediaVariant whose sourceMediaObjectId
 *          points here. When a variant's refCount drops to <=0, schedule its
 *          own delete = NOW() + 7d (PLAN §5.1 grace).
 *       b. Delete the source R2 blob.
 *       c. Delete the MediaObject row. Variant rows survive thanks to the
 *          FK SetNull (slice-E migration); their own delete is governed by
 *          their refCount + scheduledDeleteAt.
 *
 *   Pass 2 — MediaVariant orphans.
 *     refCount<=0 + scheduledDeleteAt past → delete blob + row.
 *
 * Storage delete failures are logged and the DB delete still proceeds for
 * the next eligible row — leaving a stale R2 object is far less harmful
 * than blocking GC. We may add a quarantine table later if this becomes
 * an issue at scale.
 */

const DEFAULT_BATCH_SIZE = 500;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export type MediaCleanupResult = {
  mediaObjectsReaped: number;
  variantsScheduled: number;
  variantsReaped: number;
};

export function makeMediaCleanupProcessor(deps: {
  storage: Storage;
  logger: Logger;
  batchSize?: number;
}) {
  const { storage, logger, batchSize = DEFAULT_BATCH_SIZE } = deps;

  return async function processMediaCleanupJob(job: Job<unknown>): Promise<MediaCleanupResult> {
    const log = logger.child({ jobId: job.id, queue: job.queueName });
    const now = new Date();

    let mediaObjectsReaped = 0;
    let variantsScheduled = 0;
    let variantsReaped = 0;

    // ── Pass 1: MediaObject orphans ───────────────────────────────────────
    const mediaOrphans = await prisma.mediaObject.findMany({
      where: { refCount: { lte: 0 }, scheduledDeleteAt: { lte: now, not: null } },
      select: { id: true, hash: true, r2Key: true },
      take: batchSize,
    });

    for (const m of mediaOrphans) {
      // 1a. Decrement variant refCounts pointing at this source.
      const ownedVariants = await prisma.mediaVariant.findMany({
        where: { sourceMediaObjectId: m.id },
        select: { id: true, refCount: true },
      });
      for (const v of ownedVariants) {
        const next = v.refCount - 1;
        if (next <= 0) {
          await prisma.mediaVariant.update({
            where: { id: v.id },
            data: { refCount: next, scheduledDeleteAt: new Date(now.getTime() + SEVEN_DAYS_MS) },
          });
          variantsScheduled += 1;
        } else {
          await prisma.mediaVariant.update({ where: { id: v.id }, data: { refCount: next } });
        }
      }

      // 1b. Delete the source blob (best-effort).
      try {
        await storage.delete(m.r2Key);
      } catch (err) {
        log.warn({ err, key: m.r2Key, mediaObjectId: m.id }, "source blob delete failed");
      }

      // 1c. Delete the MediaObject row. FK SetNull keeps variant rows alive
      //     so the scheduled-delete grace can run its course.
      try {
        await prisma.mediaObject.delete({ where: { id: m.id } });
        mediaObjectsReaped += 1;
      } catch (err) {
        log.error({ err, mediaObjectId: m.id }, "MediaObject row delete failed");
      }
    }

    // ── Pass 2: MediaVariant orphans ──────────────────────────────────────
    const variantOrphans = await prisma.mediaVariant.findMany({
      where: { refCount: { lte: 0 }, scheduledDeleteAt: { lte: now, not: null } },
      select: { id: true, hash: true },
      take: batchSize,
    });

    for (const v of variantOrphans) {
      const key = variantKeyFromHash(v.hash);
      try {
        await storage.delete(key);
      } catch (err) {
        log.warn({ err, key, variantId: v.id }, "variant blob delete failed");
      }
      try {
        await prisma.mediaVariant.delete({ where: { id: v.id } });
        variantsReaped += 1;
      } catch (err) {
        log.error({ err, variantId: v.id }, "MediaVariant row delete failed");
      }
    }

    log.info(
      { mediaObjectsReaped, variantsScheduled, variantsReaped },
      "media-cleanup tick complete",
    );
    return { mediaObjectsReaped, variantsScheduled, variantsReaped };
  };
}
