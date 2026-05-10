import { decryptFromString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import { type FeedConnector, makeConnector } from "@inmolink/imports";
import { feedImportSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FeedConnectorKind, FeedRunStatus, FeedRunTrigger } from "@prisma/client";
import type { Job, Queue } from "bullmq";
import type { Logger } from "pino";
import { downloadAndDedupImage } from "./image-attach.js";
import { upsertPropertyFromListing } from "./upsert-property.js";

/**
 * FEED_IMPORT job processor (PLAN §11.5).
 *
 * Lifecycle:
 *   1. Acquire mutex on FeedConnection — atomic UPDATE WHERE isLocked=false.
 *      If 0 rows → another run in progress, exit cleanly.
 *   2. Resolve / create FeedRun (api pre-creates for MANUAL; CRON scheduler
 *      ticks lack a runId, so we create one here).
 *   3. Decrypt credentials (none expected for KYERO/RESALE_ONLINE in v1, but
 *      the schema supports them for protected feeds).
 *   4. Stream the connector. Per listing: upsert Property; if not locked,
 *      download images, dedup, attach. Tally counts + errors.
 *   5. Mark FeedRun SUCCESS / PARTIAL (errors but progress) / FAILED (no
 *      progress). Release the mutex.
 */

export function makeFeedImportProcessor(deps: {
  storage: Storage;
  imageVariantQueue: Queue;
  logger: Logger;
  /** Shared key from worker env, hex-encoded 32 bytes — matches api. */
  encryptionKey: string;
}) {
  const { storage, imageVariantQueue, logger, encryptionKey } = deps;

  return async function processFeedImportJob(job: Job<unknown>): Promise<{
    runId: string;
    status: FeedRunStatus;
    counts: {
      total: number;
      created: number;
      updated: number;
      skippedLocked: number;
      failed: number;
    };
  }> {
    const data = feedImportSchemas.feedImportJobSchema.parse(job.data);
    const log = logger.child({ jobId: job.id, feedConnectionId: data.feedConnectionId });

    // 1. Mutex
    const lockResult = await prisma.feedConnection.updateMany({
      where: { id: data.feedConnectionId, isLocked: false, syncEnabled: true },
      data: { isLocked: true, lockedAt: new Date() },
    });
    if (lockResult.count === 0) {
      log.warn("FeedConnection not lockable (already locked or syncEnabled=false), skipping");
      throw new Error("Feed connection unavailable for import");
    }

    const connection = await prisma.feedConnection.findUniqueOrThrow({
      where: { id: data.feedConnectionId },
    });

    // 2. Resolve FeedRun
    const triggeredBy: FeedRunTrigger = data.triggeredBy;
    const startedAt = new Date();
    const run = data.runId
      ? await prisma.feedRun.update({
          where: { id: data.runId },
          data: { status: "RUNNING", startedAt },
        })
      : await prisma.feedRun.create({
          data: {
            connectionId: data.feedConnectionId,
            status: "RUNNING",
            triggeredBy,
            startedAt,
          },
        });

    // Counters bumped in-process; flushed at end (and on failure).
    let total = 0;
    let created = 0;
    let updated = 0;
    let skippedLocked = 0;
    let failed = 0;
    const errors: Array<{ ref?: string; message: string }> = [];
    let fatalError: Error | null = null;

    try {
      // 3. Connector + creds
      const credentials = decryptCredentialsOrEmpty(connection.credentialsEnc, encryptionKey);

      const connector = pickConnector(connection.kind, connection.fieldMappings);

      // 4. Stream
      const iter = connector.fetch({
        feedUrl: connection.feedUrl,
        credentials,
      });

      for await (const listing of iter) {
        total++;
        try {
          const result = await upsertPropertyFromListing({
            ownerUserId: connection.ownerUserId,
            ownerAgencyId: await resolveAgencyId(connection.ownerUserId, connection.agencyId),
            source: connection.kind as FeedConnectorKind,
            listing,
          });

          if (result.action === "skipped-locked") {
            skippedLocked++;
            continue;
          }
          if (result.action === "created") created++;
          else if (result.action === "updated") updated++;

          // Image attach pass — sequential per property to keep R2 / Postgres
          // pressure bounded. Per-property errors don't kill the run.
          if (result.runImages && listing.imageUrls.length > 0) {
            await attachImages({
              propertyId: result.propertyId,
              urls: listing.imageUrls,
              storage,
              imageVariantQueue,
              logger: log,
            });
          }
        } catch (err) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          if (errors.length < 100) {
            errors.push({ ref: listing.externalRef, message });
          }
          log.warn({ ref: listing.externalRef, err }, "listing processing failed");
        }
      }
    } catch (err) {
      fatalError = err instanceof Error ? err : new Error(String(err));
      log.error({ err: fatalError }, "fatal feed import error");
    }

    // 5. Persist run + release mutex. Out of `finally` so we don't shadow
    // throws inside `try` — any DB error here will surface naturally and
    // BullMQ will mark the job failed.
    const finishedAt = new Date();
    const status: FeedRunStatus = fatalError
      ? total === 0
        ? "FAILED"
        : "PARTIAL"
      : failed > 0
        ? "PARTIAL"
        : "SUCCESS";

    await prisma.$transaction([
      prisma.feedRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt,
          itemsTotal: total,
          itemsCreated: created,
          itemsUpdated: updated,
          itemsSkippedLocked: skippedLocked,
          itemsFailed: failed,
          errorSummary: fatalError ? fatalError.message : null,
          errorsLog: errors.length > 0 ? errors : undefined,
        },
      }),
      prisma.feedConnection.update({
        where: { id: data.feedConnectionId },
        data: {
          isLocked: false,
          lockedAt: null,
          lastRunAt: finishedAt,
          lastSuccessAt: status === "SUCCESS" ? finishedAt : connection.lastSuccessAt,
          lastError: fatalError ? fatalError.message : null,
        },
      }),
    ]);

    log.info(
      { runId: run.id, status, total, created, updated, skippedLocked, failed },
      "feed import run finished",
    );

    return {
      runId: run.id,
      status,
      counts: { total, created, updated, skippedLocked, failed },
    };
  };
}

function pickConnector(kind: FeedConnectorKind, fieldMappings: unknown): FeedConnector {
  if (kind === "GENERIC_XML") {
    const parsed = feedImportSchemas.genericXmlConfigSchema.safeParse(fieldMappings);
    if (!parsed.success) {
      throw new Error(
        `GENERIC_XML connector requires valid fieldMappings; got ${parsed.error.message}`,
      );
    }
    return makeConnector("GENERIC_XML", { genericXmlConfig: parsed.data });
  }
  return makeConnector(kind);
}

function decryptCredentialsOrEmpty(
  enc: string | null,
  hexKey: string,
): Record<string, string> | undefined {
  if (!enc) return undefined;
  const keyBuf = Buffer.from(hexKey, "hex");
  const plain = decryptFromString(enc, keyBuf);
  try {
    const parsed = JSON.parse(plain);
    if (parsed && typeof parsed === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    // Fall through to single-secret form.
  }
  return { secret: plain };
}

async function resolveAgencyId(
  ownerUserId: string,
  fallbackAgencyId: string | null,
): Promise<string> {
  if (fallbackAgencyId) return fallbackAgencyId;
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: ownerUserId },
    select: { agencyId: true },
  });
  if (!owner.agencyId) {
    throw new Error(`Owner user ${ownerUserId} is not in an agency`);
  }
  return owner.agencyId;
}

async function attachImages(args: {
  propertyId: string;
  urls: string[];
  storage: Storage;
  imageVariantQueue: Queue;
  logger: Logger;
}): Promise<void> {
  for (let i = 0; i < args.urls.length; i++) {
    const url = args.urls[i];
    if (!url) continue;
    try {
      const { mediaObjectId } = await downloadAndDedupImage({
        url,
        storage: args.storage,
        imageVariantQueue: args.imageVariantQueue,
        logger: args.logger,
      });
      // Attach as PropertyImage if we don't already have it. Position is
      // best-effort; first image becomes the cover when the property has
      // no cover yet.
      const existing = await prisma.propertyImage.findFirst({
        where: { propertyId: args.propertyId, mediaObjectId },
        select: { id: true },
      });
      if (existing) continue;

      const cover =
        i === 0
          ? !(await prisma.propertyImage.findFirst({
              where: { propertyId: args.propertyId, isCover: true },
              select: { id: true },
            }))
          : false;

      await prisma.$transaction([
        prisma.mediaObject.update({
          where: { id: mediaObjectId },
          data: { refCount: { increment: 1 }, scheduledDeleteAt: null },
        }),
        prisma.propertyImage.create({
          data: {
            propertyId: args.propertyId,
            mediaObjectId,
            position: i,
            isCover: cover,
            altText: null,
          },
        }),
      ]);
    } catch (err) {
      args.logger.warn({ url, err }, "image attach failed");
    }
  }
}
