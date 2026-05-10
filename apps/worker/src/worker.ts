import { prisma } from "@inmolink/db";
import { MeilisearchAdapter } from "@inmolink/search";
import { type Job, type Processor, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "./config.js";
import { makeFeedImportProcessor } from "./processors/feed-import/processor.js";
import { makeImageVariantProcessor } from "./processors/image-variant/processor.js";
import { makeMediaCleanupProcessor } from "./processors/media-cleanup/processor.js";
import { makeOutboxDrainProcessor } from "./processors/outbox-drain/processor.js";
import { makeSitemapGenerateProcessor } from "./processors/sitemap-generate/processor.js";
import { QUEUE_NAMES, type QueueName } from "./queues.js";
import { createStorage } from "./storage.js";

const env = loadConfig();

const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        },
      }
    : {}),
  redact: ["*.email", "*.phone", "*.password", "*.smtpPassword", "*.stripeApiKey"],
});

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // BullMQ requirement
  enableReadyCheck: true,
});

connection.on("connect", () => logger.info("Redis connected"));
connection.on("error", (err) => logger.error({ err }, "Redis error"));

const storage = createStorage(env);
logger.info({ kind: storage.kind }, "Storage backend selected");

/**
 * Placeholder processor for queues whose real handler lands in a later sprint:
 * - FEED_IMPORT: Sprint 5 (Kyero / Resale Online / Generic XML connectors)
 * - EMAIL_SEND: Sprint 6 + Sprint 8 (per-agency SMTP)
 * - WEBHOOK_DELIVER: Sprint 10 (HMAC-signed deliveries with retry + DLQ)
 * - EXPORT_GENERATE: Sprint 11 (CSV + PDF via Puppeteer)
 * - CHAT_FANOUT: Sprint 6
 */
const placeholderProcessor: Processor = async (job: Job) => {
  logger.info(
    { jobId: job.id, queue: job.queueName, name: job.name },
    "Job received (placeholder)",
  );
};

const searchAdapter = new MeilisearchAdapter(env.MEILISEARCH_HOST, env.MEILISEARCH_API_KEY);

const imageVariantProcessor = makeImageVariantProcessor({ storage, logger });
const mediaCleanupProcessor = makeMediaCleanupProcessor({ storage, logger });
const outboxDrainProcessor = makeOutboxDrainProcessor({ adapter: searchAdapter, logger });
const sitemapGenerateProcessor = makeSitemapGenerateProcessor({
  storage,
  logger,
  publicBaseUrl: env.PUBLIC_BASE_URL,
});

// FEED_IMPORT shares Redis with the IMAGE_VARIANT queue — we hand the
// processor a ref to the same Queue so freshly imported MediaObjects
// trigger eager variant generation through the existing pipeline.
const imageVariantQueueForImport = new Queue(QUEUE_NAMES.IMAGE_VARIANT, { connection });
const feedImportProcessor = makeFeedImportProcessor({
  storage,
  imageVariantQueue: imageVariantQueueForImport,
  logger,
  encryptionKey: env.ENCRYPTION_KEY,
});

function processorFor(queueName: QueueName): Processor {
  if (queueName === QUEUE_NAMES.IMAGE_VARIANT) return imageVariantProcessor;
  if (queueName === QUEUE_NAMES.MEDIA_CLEANUP) return mediaCleanupProcessor;
  if (queueName === QUEUE_NAMES.SEARCH_REINDEX) return outboxDrainProcessor;
  if (queueName === QUEUE_NAMES.SITEMAP_GENERATE) return sitemapGenerateProcessor;
  if (queueName === QUEUE_NAMES.FEED_IMPORT) return feedImportProcessor;
  return placeholderProcessor;
}

/**
 * MEDIA_CLEANUP Queue + scheduler. The scheduler is upserted on every
 * worker boot so adding a worker pod is enough — no separate ops step.
 * Pattern is BullMQ's 6-field cron with seconds first ("0 0 3 * * *"
 * means 03:00:00 every day). PLAN §5.1.
 */
const mediaCleanupQueue = new Queue(QUEUE_NAMES.MEDIA_CLEANUP, { connection });
const MEDIA_CLEANUP_SCHEDULE_PATTERN = "0 0 3 * * *";
const MEDIA_CLEANUP_SCHEDULE_ID = "media-cleanup-daily";

/**
 * SEARCH_REINDEX Queue + outbox-drain scheduler. Ticks every 5 seconds —
 * cheap poll (one indexed query); good enough latency for "search shows
 * the new property within 5s of the dashboard save". PLAN §11.5.
 */
const searchReindexQueue = new Queue(QUEUE_NAMES.SEARCH_REINDEX, { connection });
const OUTBOX_DRAIN_SCHEDULE_EVERY_MS = 5_000;
const OUTBOX_DRAIN_SCHEDULE_ID = "outbox-drain-tick";

/**
 * SITEMAP_GENERATE Queue + scheduler. Daily at 02:00 UTC — apps/public
 * route handlers serve the latest output from Storage. PLAN §11.13.
 */
const sitemapQueue = new Queue(QUEUE_NAMES.SITEMAP_GENERATE, { connection });
const SITEMAP_SCHEDULE_PATTERN = "0 0 2 * * *";
const SITEMAP_SCHEDULE_ID = "sitemap-generate-daily";

const workers: Worker[] = [];

for (const [key, queueName] of Object.entries(QUEUE_NAMES)) {
  const concurrency = (() => {
    if (queueName === QUEUE_NAMES.IMAGE_VARIANT) return env.CONCURRENCY_VARIANTS;
    if (queueName === QUEUE_NAMES.FEED_IMPORT) return env.CONCURRENCY_IMPORTS;
    if (queueName === QUEUE_NAMES.EMAIL_SEND) return env.CONCURRENCY_EMAILS;
    if (queueName === QUEUE_NAMES.WEBHOOK_DELIVER) return env.CONCURRENCY_WEBHOOKS;
    if (queueName === QUEUE_NAMES.SEARCH_REINDEX) return env.CONCURRENCY_REINDEX;
    return 2;
  })();

  const worker = new Worker(queueName, processorFor(queueName), {
    connection,
    concurrency,
    autorun: true,
  });

  worker.on("completed", (job) => logger.debug({ jobId: job.id, queue: queueName }, "completed"));
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, queue: queueName, err }, "job failed"),
  );

  workers.push(worker);
  logger.info({ queue: queueName, key, concurrency }, "Worker started");
}

logger.info({ count: workers.length }, "All workers started");

// Idempotent — re-running upsert with the same id replaces the schedule.
await mediaCleanupQueue.upsertJobScheduler(
  MEDIA_CLEANUP_SCHEDULE_ID,
  { pattern: MEDIA_CLEANUP_SCHEDULE_PATTERN },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 100 },
    },
  },
);
logger.info(
  { id: MEDIA_CLEANUP_SCHEDULE_ID, pattern: MEDIA_CLEANUP_SCHEDULE_PATTERN },
  "Media-cleanup scheduler upserted",
);

await searchReindexQueue.upsertJobScheduler(
  OUTBOX_DRAIN_SCHEDULE_ID,
  { every: OUTBOX_DRAIN_SCHEDULE_EVERY_MS },
  {
    name: "tick",
    data: {},
    opts: {
      // Each tick is short — a few rows of work or zero. Don't keep failed
      // ticks around; the outbox row itself carries the failure state.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: OUTBOX_DRAIN_SCHEDULE_ID, everyMs: OUTBOX_DRAIN_SCHEDULE_EVERY_MS },
  "Outbox-drain scheduler upserted",
);

await sitemapQueue.upsertJobScheduler(
  SITEMAP_SCHEDULE_ID,
  { pattern: SITEMAP_SCHEDULE_PATTERN },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 2,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: SITEMAP_SCHEDULE_ID, pattern: SITEMAP_SCHEDULE_PATTERN },
  "Sitemap-generate scheduler upserted",
);

/**
 * Feed-import scheduler reconciliation (PLAN §11.5).
 *
 * The api keeps schedulers in sync with FeedConnection state on every CRUD
 * write. We reconcile at worker boot too as a drift safety net — adds
 * schedulers for any active connection missing one, removes orphaned ones.
 */
const feedImportQueue = new Queue(QUEUE_NAMES.FEED_IMPORT, { connection });

async function reconcileFeedImportSchedulers(): Promise<void> {
  const active = await prisma.feedConnection.findMany({
    where: { syncEnabled: true },
    select: { id: true, cronSchedule: true },
  });
  const wantIds = new Set(active.map((c) => `feed-import:scheduler:${c.id}`));

  for (const c of active) {
    await feedImportQueue.upsertJobScheduler(
      `feed-import:scheduler:${c.id}`,
      { pattern: c.cronSchedule },
      {
        name: "tick",
        data: { feedConnectionId: c.id, triggeredBy: "CRON" },
        opts: { attempts: 1, removeOnComplete: { count: 30 }, removeOnFail: { count: 50 } },
      },
    );
  }

  const existing = await feedImportQueue.getJobSchedulers(0, 1000);
  for (const scheduler of existing) {
    if (scheduler.id?.startsWith("feed-import:scheduler:") && !wantIds.has(scheduler.id)) {
      await feedImportQueue.removeJobScheduler(scheduler.id);
      logger.info({ id: scheduler.id }, "Feed-import scheduler removed (orphan)");
    }
  }
  logger.info({ active: active.length }, "Feed-import schedulers reconciled");
}

await reconcileFeedImportSchedulers().catch((err) => {
  logger.error({ err }, "Feed-import scheduler reconciliation failed");
});

// Graceful shutdown — drain in-flight jobs (PLAN §11.7)
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down workers gracefully");
  await Promise.all(workers.map((w) => w.close()));
  await mediaCleanupQueue.close();
  await searchReindexQueue.close();
  await sitemapQueue.close();
  await feedImportQueue.close();
  await imageVariantQueueForImport.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
