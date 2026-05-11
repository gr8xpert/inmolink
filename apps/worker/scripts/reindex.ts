import { prisma } from "@inmolink/db";
import {
  MeilisearchAdapter,
  type ReindexableProperty,
  buildPropertyDocuments,
  propertyReindexInclude,
} from "@inmolink/search";
import pino from "pino";
import { loadConfig } from "../src/config";

/**
 * Full reindex script — disaster recovery + first-boot.
 *
 *   pnpm --filter @inmolink/worker exec tsx scripts/reindex.ts
 *
 * Steps:
 *   1. Configure all per-locale indices (idempotent: searchable / filterable /
 *      sortable attributes + ranking rules).
 *   2. Stream every ACTIVE+PUBLIC Property row from Postgres in cursor batches
 *      of 500. Loading the full ceiling (150M rows) into memory is unsafe.
 *   3. Project each batch to per-locale docs and upsert as a single Meili task.
 *
 * The outbox-drain worker continues to run independently; if a property is
 * mutated mid-reindex the new outbox event will simply re-overwrite the doc
 * the script wrote a second earlier (last-write-wins is fine for this).
 *
 * Use `--dry-run` to validate the projection without writing to Meili (useful
 * if Meili is offline; you'll still see "would have indexed N docs" output).
 */

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const env = loadConfig();
  const logger = pino({ level: env.LOG_LEVEL });

  const dryRun = process.argv.includes("--dry-run");

  const adapter = new MeilisearchAdapter(env.MEILISEARCH_HOST, env.MEILISEARCH_API_KEY);

  if (!dryRun) {
    const ok = await adapter.ping();
    if (!ok) {
      logger.error({ host: env.MEILISEARCH_HOST }, "Meilisearch is not reachable; aborting");
      process.exit(1);
    }
    logger.info("Configuring per-locale indices");
    await adapter.configureAllIndices();
  } else {
    logger.warn("--dry-run: skipping Meilisearch writes");
  }

  let cursor: { createdAt: Date; id: string } | null = null;
  let total = 0;
  let totalDocs = 0;

  while (true) {
    const where: Parameters<typeof prisma.property.findMany>[0] = {
      where: {
        deletedAt: null,
        status: "ACTIVE",
        visibility: "PUBLIC",
      },
      include: propertyReindexInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH_SIZE,
    };
    if (cursor) {
      where.cursor = { id: cursor.id };
      where.skip = 1;
    }

    const rows = await prisma.property.findMany(where);
    if (rows.length === 0) break;

    const docs = rows.flatMap((r) => buildPropertyDocuments(r as ReindexableProperty));
    if (!dryRun && docs.length > 0) {
      await adapter.upsertBatch(docs);
    }
    total += rows.length;
    totalDocs += docs.length;
    logger.info(
      { batchRows: rows.length, batchDocs: docs.length, total, totalDocs },
      "reindex batch",
    );

    const last = rows[rows.length - 1];
    if (!last) break;
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  logger.info({ total, totalDocs, dryRun }, "Reindex complete");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
