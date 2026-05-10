import { z } from "zod";

export const notificationKindSchema = z.enum([
  "VIEWING_REQUESTED",
  "VIEWING_ACCEPTED",
  "VIEWING_DECLINED",
  "VIEWING_RESCHEDULED",
  "VIEWING_CANCELLED",
  "VIEWING_EXPIRING_SOON",
  "VIEWING_OUTCOME_SET",
  "DEAL_SUBMITTED",
  "DEAL_CONFIRMED",
  "DEAL_DISPUTED",
  "DEAL_DISPUTE_RESOLVED",
  "CHAT_MESSAGE",
  "LEAD_RECEIVED",
  "IMPORT_FAILED",
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

const isoDateTime = z.string().datetime();

export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  targetKind: z.string().nullable(),
  targetId: z.string().nullable(),
  payload: z.unknown().nullable(),
  readAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
