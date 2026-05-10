import { prisma } from "@inmolink/db";
import {
  type MeilisearchAdapter,
  buildPropertyDocuments,
  propertyReindexInclude,
} from "@inmolink/search";
import { LOCALES, outboxSchemas } from "@inmolink/shared";
import type { Job } from "bullmq";
import type { Logger } from "pino";

/**
 * Outbox drain processor — PLAN §11.5.
 *
 * Each tick (scheduler runs ~every 5s) we claim the next batch of PENDING
 * OutboxEvent rows ordered by createdAt, project them through the search
 * adapter, then mark each PROCESSED. Errors set status=FAILED and bump
 * `attempts` — a separate retry policy could pick them up later, but for
 * v1 we surface failures in logs and lean on the manual reindex script.
 *
 * Why poll instead of LISTEN/NOTIFY: scheduler ticks are cheaper to reason
 * about under failure (the job system already has retries + observability),
 * and we don't yet need sub-second latency for search updates. Switching to
 * LISTEN later means changing only this file.
 *
 * Topic dispatch:
 *   - `search.property.upsert`  → load property with `propertyReindexInclude`,
 *     project to per-locale docs, batch-upsert into Meili. If the property is
 *     no longer ACTIVE+PUBLIC, project returns [] and we treat that as a
 *     pull-from-index (delete across all locales) — keeps the worker idempotent
 *     under visibility transitions.
 *   - `search.property.delete`  → delete across all locales.
 */

const DEFAULT_BATCH_SIZE = 50;

export type OutboxDrainResult = {
  processed: number;
  failed: number;
};

export function makeOutboxDrainProcessor(deps: {
  adapter: MeilisearchAdapter;
  logger: Logger;
  batchSize?: number;
}) {
  const { adapter, logger, batchSize = DEFAULT_BATCH_SIZE } = deps;

  return async function processOutboxDrainJob(job: Job<unknown>): Promise<OutboxDrainResult> {
    const log = logger.child({ jobId: job.id, queue: job.queueName });

    const pending = await prisma.outboxEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (pending.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    for (const evt of pending) {
      try {
        if (evt.topic === outboxSchemas.SEARCH_PROPERTY_UPSERT) {
          const payload = outboxSchemas.SearchPropertyUpsertPayload.parse(evt.payload);
          const row = await prisma.property.findUnique({
            where: { id: payload.propertyId },
            include: propertyReindexInclude,
          });

          if (!row || row.deletedAt !== null) {
            // Race: property was deleted between emit + drain. Treat as
            // remove-from-index — idempotent.
            await adapter.delete(payload.propertyId);
          } else {
            const docs = buildPropertyDocuments(row);
            if (docs.length === 0) {
              // Indexable predicate failed (visibility / status flip).
              await adapter.delete(payload.propertyId);
            } else {
              await adapter.upsertBatch(docs);
            }
          }
        } else if (evt.topic === outboxSchemas.SEARCH_PROPERTY_DELETE) {
          const payload = outboxSchemas.SearchPropertyDeletePayload.parse(evt.payload);
          const locales = payload.locales.length > 0 ? payload.locales : [...LOCALES];
          await adapter.delete(payload.propertyId, locales);
        } else {
          // Unknown topic — fail visibly. Older code may have written it.
          throw new Error(`Unknown outbox topic: ${evt.topic}`);
        }

        await prisma.outboxEvent.update({
          where: { id: evt.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ err, eventId: evt.id, topic: evt.topic }, "outbox event failed");
        await prisma.outboxEvent.update({
          where: { id: evt.id },
          data: {
            status: "FAILED",
            attempts: { increment: 1 },
            errorLast: message,
          },
        });
        failed += 1;
      }
    }

    log.info({ processed, failed, batchSize: pending.length }, "outbox-drain tick complete");
    return { processed, failed };
  };
}
