import { z } from "zod";
import { assertSafeUrlStatic } from "../ssrf";

/** Sprint 10. Outbound webhooks (PLAN §11.10). */

/**
 * Webhook URL: HTTPS only, no private/reserved hosts. We block at create/update
 * time (this schema) and re-check at delivery time with the async DNS variant
 * (worker side) so a public hostname cannot rebind to a private IP between
 * registration and delivery.
 */
const webhookUrlSchema = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    try {
      assertSafeUrlStatic(value, { allowHttp: false });
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : "Invalid webhook URL",
      });
    }
  });

export const webhookEventTypeSchema = z.enum([
  "PROPERTY_CREATED",
  "PROPERTY_UPDATED",
  "PROPERTY_DELETED",
  "LEAD_CREATED",
  "VIEWING_REQUESTED",
  "VIEWING_ACCEPTED",
  "VIEWING_DECLINED",
  "VIEWING_COMPLETED",
  "DEAL_CONFIRMED",
  "DEAL_DISPUTED",
  "AGENT_INVITED",
  "AGENT_JOINED",
  "IMPORT_RUN_COMPLETED",
  "IMPORT_RUN_FAILED",
  "CHAT_MESSAGE_RECEIVED",
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookDeliveryStatusSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTERED",
]);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

// ---- Endpoint CRUD ----

export const webhookEndpointInputSchema = z.object({
  url: webhookUrlSchema,
  events: z.array(webhookEventTypeSchema).min(1).max(15),
  secret: z.string().min(16).max(128).optional(), // omit on update keeps existing
  isActive: z.boolean().default(true),
  description: z.string().max(255).optional().nullable(),
});
export type WebhookEndpointInput = z.infer<typeof webhookEndpointInputSchema>;

export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(webhookEventTypeSchema),
  isActive: z.boolean(),
  description: z.string().nullable(),
  hasSecret: z.boolean(),
  // Last 4 hex chars — enough to fingerprint without leaking the full HMAC key.
  secretSuffix: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const webhookEndpointListResponseSchema = z.object({
  items: z.array(webhookEndpointSchema),
});

// ---- Delivery (super-admin viewer) ----

export const webhookDeliveryAttemptSchema = z.object({
  id: z.string(),
  attemptedAt: z.string(),
  responseStatus: z.number().int().nullable(),
  responseBodyTrunc: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().nullable(),
});
export type WebhookDeliveryAttempt = z.infer<typeof webhookDeliveryAttemptSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  eventType: webhookEventTypeSchema,
  endpointId: z.string(),
  endpointUrl: z.string(),
  agencyId: z.string(),
  agencyName: z.string().nullable(),
  status: webhookDeliveryStatusSchema,
  attemptCount: z.number().int(),
  lastAttemptAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  succeededAt: z.string().nullable(),
  deadLetteredAt: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveryDetailSchema = webhookDeliverySchema.extend({
  payload: z.unknown(),
  attempts: z.array(webhookDeliveryAttemptSchema),
});
export type WebhookDeliveryDetail = z.infer<typeof webhookDeliveryDetailSchema>;

export const webhookDeliveryListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: webhookDeliveryStatusSchema.optional(),
  agencyId: z.string().optional(),
  eventType: webhookEventTypeSchema.optional(),
  endpointId: z.string().optional(),
});

export const webhookDeliveryListResponseSchema = z.object({
  items: z.array(webhookDeliverySchema),
  nextCursor: z.string().nullable(),
});

// ---- Test / replay ----

export const webhookTestInputSchema = z.object({
  eventType: webhookEventTypeSchema.default("PROPERTY_CREATED"),
});

// ---- BullMQ webhook-deliver job payload ----
export const webhookDeliverJobSchema = z.object({
  deliveryId: z.string().min(1),
});
export type WebhookDeliverJobData = z.infer<typeof webhookDeliverJobSchema>;
