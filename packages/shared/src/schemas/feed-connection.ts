import { z } from "zod";
import { genericXmlConfigSchema } from "./feed-import";

/**
 * FeedConnection CRUD + run history schemas (PLAN §11.5).
 *
 * Credentials are write-only on the wire — the api AES-encrypts before
 * persistence and never returns ciphertext. Cron schedules use BullMQ's
 * standard 5-field cron syntax (worker-side `upsertJobScheduler` with
 * `pattern`).
 */

const cuid = z.string().min(1);

export const feedConnectorKindSchema = z.enum(["KYERO", "RESALE_ONLINE", "GENERIC_XML"]);

export const feedRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export const feedRunTriggerSchema = z.enum(["CRON", "MANUAL", "RETRY"]);

/** 5-field cron with optional seconds prefix. Reuse BullMQ's parser at runtime. */
export const cronScheduleSchema = z
  .string()
  .min(5)
  .max(120)
  .regex(/^[0-9*/,\- ]+$/, "Cron schedule contains invalid characters");

export const feedConnectionCreateSchema = z.object({
  kind: feedConnectorKindSchema,
  feedUrl: z.string().url(),
  credentials: z.record(z.string(), z.string()).nullable().optional(),
  fieldMappings: genericXmlConfigSchema.nullable().optional(),
  syncEnabled: z.boolean().default(true),
  cronSchedule: cronScheduleSchema.default("0 */6 * * *"),
});

export const feedConnectionUpdateSchema = z.object({
  feedUrl: z.string().url().optional(),
  /** Set to null to clear stored credentials. Omit to leave unchanged. */
  credentials: z.record(z.string(), z.string()).nullable().optional(),
  fieldMappings: genericXmlConfigSchema.nullable().optional(),
  syncEnabled: z.boolean().optional(),
  cronSchedule: cronScheduleSchema.optional(),
});

export const feedConnectionSchema = z.object({
  id: cuid,
  ownerUserId: cuid,
  agencyId: cuid.nullable(),
  kind: feedConnectorKindSchema,
  feedUrl: z.string().url(),
  /** True iff credentialsEnc is non-null. The plaintext is never returned. */
  hasCredentials: z.boolean(),
  fieldMappings: genericXmlConfigSchema.nullable(),
  syncEnabled: z.boolean(),
  cronSchedule: z.string(),
  isLocked: z.boolean(),
  lockedAt: z.string().datetime().nullable(),
  lastRunAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const feedConnectionListResponseSchema = z.object({
  items: z.array(feedConnectionSchema),
});

export const feedRunSchema = z.object({
  id: cuid,
  connectionId: cuid,
  status: feedRunStatusSchema,
  triggeredBy: feedRunTriggerSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  itemsTotal: z.number().int().nonnegative(),
  itemsCreated: z.number().int().nonnegative(),
  itemsUpdated: z.number().int().nonnegative(),
  itemsSkippedLocked: z.number().int().nonnegative(),
  itemsFailed: z.number().int().nonnegative(),
  errorSummary: z.string().nullable(),
});

export const feedRunListResponseSchema = z.object({
  items: z.array(feedRunSchema),
});

export const feedRunDetailSchema = feedRunSchema.extend({
  errorsLog: z.array(z.object({ ref: z.string().optional(), message: z.string() })).nullable(),
});

export const manualRunResponseSchema = z.object({
  runId: cuid,
  jobId: z.string(),
});

export type FeedConnectionCreate = z.infer<typeof feedConnectionCreateSchema>;
export type FeedConnectionUpdate = z.infer<typeof feedConnectionUpdateSchema>;
export type FeedConnection = z.infer<typeof feedConnectionSchema>;
export type FeedRun = z.infer<typeof feedRunSchema>;
