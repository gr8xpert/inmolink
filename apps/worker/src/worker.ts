import { type Job, type Processor, Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "./config.js";
import { makeImageVariantProcessor } from "./processors/image-variant/processor.js";
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
 * - MEDIA_CLEANUP: Sprint 1 (orphan R2 objects past grace period — slice E)
 */
const placeholderProcessor: Processor = async (job: Job) => {
  logger.info(
    { jobId: job.id, queue: job.queueName, name: job.name },
    "Job received (placeholder)",
  );
};

const imageVariantProcessor = makeImageVariantProcessor({ storage, logger });

function processorFor(queueName: QueueName): Processor {
  if (queueName === QUEUE_NAMES.IMAGE_VARIANT) return imageVariantProcessor;
  return placeholderProcessor;
}

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

// Graceful shutdown — drain in-flight jobs (PLAN §11.7)
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down workers gracefully");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
