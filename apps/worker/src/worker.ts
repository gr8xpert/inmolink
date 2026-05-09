import { type Job, type Processor, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "./config.js";
import { makeImageVariantProcessor } from "./processors/image-variant/processor.js";
import { makeMediaCleanupProcessor } from "./processors/media-cleanup/processor.js";
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
 * - SEARCH_REINDEX: Sprint 3 (outbox pattern → Meilisearch)
 * - EXPORT_GENERATE: Sprint 11 (CSV + PDF via Puppeteer)
 * - CHAT_FANOUT: Sprint 6
 */
const placeholderProcessor: Processor = async (job: Job) => {
  logger.info(
    { jobId: job.id, queue: job.queueName, name: job.name },
    "Job received (placeholder)",
  );
};

const imageVariantProcessor = makeImageVariantProcessor({ storage, logger });
const mediaCleanupProcessor = makeMediaCleanupProcessor({ storage, logger });

function processorFor(queueName: QueueName): Processor {
  if (queueName === QUEUE_NAMES.IMAGE_VARIANT) return imageVariantProcessor;
  if (queueName === QUEUE_NAMES.MEDIA_CLEANUP) return mediaCleanupProcessor;
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

// Graceful shutdown — drain in-flight jobs (PLAN §11.7)
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down workers gracefully");
  await Promise.all(workers.map((w) => w.close()));
  await mediaCleanupQueue.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
