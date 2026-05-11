import { prisma } from "@inmolink/db";
import { closeBrowser } from "@inmolink/pdf";
import { MeilisearchAdapter } from "@inmolink/search";
import { type Job, type Processor, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "./config";
import { makeCampaignDispatcherProcessor } from "./processors/campaign-dispatcher/processor";
import { closeEmailTransports, makeEmailSendProcessor } from "./processors/email-send/processor";
import { makeExportCleanupProcessor } from "./processors/export-cleanup/processor";
import { makeExportGenerateProcessor } from "./processors/export-generate/processor";
import { makeFeedImportProcessor } from "./processors/feed-import/processor";
import { makeImageVariantProcessor } from "./processors/image-variant/processor";
import { makeMediaCleanupProcessor } from "./processors/media-cleanup/processor";
import { makeNotificationDigestProcessor } from "./processors/notification-digest/processor";
import { makeOutboxDrainProcessor } from "./processors/outbox-drain/processor";
import { makeSitemapGenerateProcessor } from "./processors/sitemap-generate/processor";
import { makeViewingExpireProcessor } from "./processors/viewing-expire/processor";
import { makeWebhookDeliverProcessor } from "./processors/webhook-deliver/processor";
import { makeWebhookDispatcherProcessor } from "./processors/webhook-dispatcher/processor";
import { QUEUE_NAMES, type QueueName } from "./queues";
import { createStorage } from "./storage";

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
const viewingExpireProcessor = makeViewingExpireProcessor({ logger });
const notificationDigestProcessor = makeNotificationDigestProcessor({
  logger,
  resendApiKey: env.RESEND_API_KEY,
  emailFrom: env.EMAIL_FROM,
  webBaseUrl: env.WEB_BASE_URL,
});

// Sprint 8 marketing — email-send processor + campaign dispatcher.
// We share the same Queue instance between the dispatcher and worker so
// the dispatcher can enqueue per-recipient sends.
const emailSendQueueForCampaigns = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection });
const emailSendProcessor = makeEmailSendProcessor({
  encryptionKey: env.ENCRYPTION_KEY,
  trackingSecret: env.ENCRYPTION_KEY, // doubles as HMAC secret (same trust boundary)
  webBaseUrl: env.WEB_BASE_URL,
  apiBaseUrl: env.API_BASE_URL,
  logger,
});
const campaignDispatcherProcessor = makeCampaignDispatcherProcessor({
  emailQueue: emailSendQueueForCampaigns,
  logger,
});

// Sprint 11 export. One job per Export row.
const exportGenerateProcessor = makeExportGenerateProcessor({ storage, logger });
const exportCleanupProcessor = makeExportCleanupProcessor({ storage, logger });

// Sprint 10 webhooks (out). The dispatcher needs a Queue ref to enqueue
// deliveries; the deliver processor handles HTTP POST + signing + retry.
const webhookDeliverQueue = new Queue(QUEUE_NAMES.WEBHOOK_DELIVER, { connection });
const webhookDeliverProcessor = makeWebhookDeliverProcessor({
  encryptionKey: env.ENCRYPTION_KEY,
  logger,
});
const webhookDispatcherProcessor = makeWebhookDispatcherProcessor({
  webhookQueue: webhookDeliverQueue,
  logger,
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
  if (queueName === QUEUE_NAMES.VIEWING_EXPIRE) return viewingExpireProcessor;
  if (queueName === QUEUE_NAMES.NOTIFICATION_DIGEST) return notificationDigestProcessor;
  if (queueName === QUEUE_NAMES.EMAIL_SEND) return emailSendProcessor;
  if (queueName === QUEUE_NAMES.CAMPAIGN_DISPATCHER) return campaignDispatcherProcessor;
  if (queueName === QUEUE_NAMES.WEBHOOK_DELIVER) return webhookDeliverProcessor;
  if (queueName === QUEUE_NAMES.WEBHOOK_DISPATCHER) return webhookDispatcherProcessor;
  if (queueName === QUEUE_NAMES.EXPORT_GENERATE) return exportGenerateProcessor;
  if (queueName === QUEUE_NAMES.EXPORT_CLEANUP) return exportCleanupProcessor;
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

/**
 * VIEWING_EXPIRE Queue + scheduler. Hourly sweep for PENDING ViewingRequest
 * rows past their `expiresAt`. PLAN §11.6.
 */
const viewingExpireQueue = new Queue(QUEUE_NAMES.VIEWING_EXPIRE, { connection });
const VIEWING_EXPIRE_SCHEDULE_PATTERN = "0 0 * * * *"; // top of every hour
const VIEWING_EXPIRE_SCHEDULE_ID = "viewing-expire-hourly";

/**
 * NOTIFICATION_DIGEST Queue + scheduler. Hourly tick — drains pending
 * notifications via email respecting per-user emailDigestFrequency. PLAN §11.6.
 */
const notificationDigestQueue = new Queue(QUEUE_NAMES.NOTIFICATION_DIGEST, { connection });
const NOTIFICATION_DIGEST_SCHEDULE_PATTERN = "0 5 * * * *"; // hh:05 every hour (offset from viewing-expire)
const NOTIFICATION_DIGEST_SCHEDULE_ID = "notification-digest-hourly";

/**
 * CAMPAIGN_DISPATCHER Queue + scheduler. Tick every 5 min — finds
 * SCHEDULED campaigns past `scheduledFor`, materializes recipients, and
 * enqueues per-recipient EMAIL_SEND jobs. PLAN §11.8.
 */
const campaignDispatcherQueue = new Queue(QUEUE_NAMES.CAMPAIGN_DISPATCHER, { connection });
const CAMPAIGN_DISPATCHER_SCHEDULE_EVERY_MS = 5 * 60_000;
const CAMPAIGN_DISPATCHER_SCHEDULE_ID = "campaign-dispatcher-tick";

/**
 * WEBHOOK_DISPATCHER Queue + scheduler. Tick every 30 s — finds PENDING
 * deliveries past `nextAttemptAt` and enqueues each on WEBHOOK_DELIVER.
 * PLAN §11.10.
 */
const webhookDispatcherQueue = new Queue(QUEUE_NAMES.WEBHOOK_DISPATCHER, { connection });
const WEBHOOK_DISPATCHER_SCHEDULE_EVERY_MS = 30_000;
const WEBHOOK_DISPATCHER_SCHEDULE_ID = "webhook-dispatcher-tick";

/**
 * EXPORT_CLEANUP Queue + scheduler. Daily at 03:30 — sweeps expired
 * Export rows + R2 blobs (PLAN §11.11).
 */
const exportCleanupQueue = new Queue(QUEUE_NAMES.EXPORT_CLEANUP, { connection });
const EXPORT_CLEANUP_SCHEDULE_PATTERN = "0 30 3 * * *"; // 03:30:00 daily
const EXPORT_CLEANUP_SCHEDULE_ID = "export-cleanup-daily";

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

await viewingExpireQueue.upsertJobScheduler(
  VIEWING_EXPIRE_SCHEDULE_ID,
  { pattern: VIEWING_EXPIRE_SCHEDULE_PATTERN },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: VIEWING_EXPIRE_SCHEDULE_ID, pattern: VIEWING_EXPIRE_SCHEDULE_PATTERN },
  "Viewing-expire scheduler upserted",
);

await notificationDigestQueue.upsertJobScheduler(
  NOTIFICATION_DIGEST_SCHEDULE_ID,
  { pattern: NOTIFICATION_DIGEST_SCHEDULE_PATTERN },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 2,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: NOTIFICATION_DIGEST_SCHEDULE_ID, pattern: NOTIFICATION_DIGEST_SCHEDULE_PATTERN },
  "Notification-digest scheduler upserted",
);

await campaignDispatcherQueue.upsertJobScheduler(
  CAMPAIGN_DISPATCHER_SCHEDULE_ID,
  { every: CAMPAIGN_DISPATCHER_SCHEDULE_EVERY_MS },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: CAMPAIGN_DISPATCHER_SCHEDULE_ID, everyMs: CAMPAIGN_DISPATCHER_SCHEDULE_EVERY_MS },
  "Campaign-dispatcher scheduler upserted",
);

await webhookDispatcherQueue.upsertJobScheduler(
  WEBHOOK_DISPATCHER_SCHEDULE_ID,
  { every: WEBHOOK_DISPATCHER_SCHEDULE_EVERY_MS },
  {
    name: "tick",
    data: {},
    opts: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
);
logger.info(
  { id: WEBHOOK_DISPATCHER_SCHEDULE_ID, everyMs: WEBHOOK_DISPATCHER_SCHEDULE_EVERY_MS },
  "Webhook-dispatcher scheduler upserted",
);

await exportCleanupQueue.upsertJobScheduler(
  EXPORT_CLEANUP_SCHEDULE_ID,
  { pattern: EXPORT_CLEANUP_SCHEDULE_PATTERN },
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
  { id: EXPORT_CLEANUP_SCHEDULE_ID, pattern: EXPORT_CLEANUP_SCHEDULE_PATTERN },
  "Export-cleanup scheduler upserted",
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
  await viewingExpireQueue.close();
  await notificationDigestQueue.close();
  await campaignDispatcherQueue.close();
  await emailSendQueueForCampaigns.close();
  await webhookDispatcherQueue.close();
  await webhookDeliverQueue.close();
  await exportCleanupQueue.close();
  // Close cached SMTP transports + Puppeteer browser before Redis disconnect
  // so any in-flight FD release happens with the queues already drained
  // (#016, #017).
  closeEmailTransports();
  await closeBrowser().catch((err) => logger.warn({ err }, "closeBrowser failed"));
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
