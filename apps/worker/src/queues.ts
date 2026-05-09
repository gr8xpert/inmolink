/**
 * BullMQ queue names + priority levels (PLAN §11.7).
 *
 * Priority queues:
 * - high (1):   email send, webhook delivery, real-time fanout
 * - medium (5): imports, exports
 * - low (10):   image variants, Meilisearch reindex
 */
export const QUEUE_NAMES = {
  // High priority
  EMAIL_SEND: "email-send",
  WEBHOOK_DELIVER: "webhook-deliver",
  CHAT_FANOUT: "chat-fanout",

  // Medium priority
  FEED_IMPORT: "feed-import",
  EXPORT_GENERATE: "export-generate",

  // Low priority
  IMAGE_VARIANT: "image-variant",
  SEARCH_REINDEX: "search-reindex",
  MEDIA_CLEANUP: "media-cleanup", // orphan cleanup (PLAN §11.1)
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_PRIORITIES: Record<QueueName, number> = {
  [QUEUE_NAMES.EMAIL_SEND]: 1,
  [QUEUE_NAMES.WEBHOOK_DELIVER]: 1,
  [QUEUE_NAMES.CHAT_FANOUT]: 1,
  [QUEUE_NAMES.FEED_IMPORT]: 5,
  [QUEUE_NAMES.EXPORT_GENERATE]: 5,
  [QUEUE_NAMES.IMAGE_VARIANT]: 10,
  [QUEUE_NAMES.SEARCH_REINDEX]: 10,
  [QUEUE_NAMES.MEDIA_CLEANUP]: 10,
};
