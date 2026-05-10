import { z } from "zod";

/**
 * Chat schemas (PLAN §11.6).
 *
 * Two thread kinds:
 *  - VIEWING: tied to a ViewingRequest, auto-created on accept.
 *  - DIRECT:  free-form 1:1 between two users (unique constraint via
 *             userMin/userMax pair).
 *
 * REST handles thread creation + history + read receipts. Live messages
 * land via Socket.io once the client subscribes to `thread:<id>`. The HTTP
 * POST endpoint is the canonical write surface — Socket.io is fanout only.
 */

export const chatThreadKindSchema = z.enum(["VIEWING", "DIRECT"]);
export type ChatThreadKind = z.infer<typeof chatThreadKindSchema>;

const isoDateTime = z.string().datetime();

export const chatThreadListQuerySchema = z.object({
  kind: chatThreadKindSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type ChatThreadListQuery = z.infer<typeof chatThreadListQuerySchema>;

const userSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  slug: z.string(),
  agencyId: z.string().nullable(),
});

export const chatThreadSchema = z.object({
  id: z.string(),
  kind: chatThreadKindSchema,
  /** The "other" participant from the caller's perspective. */
  counterparty: userSummarySchema,
  viewingRequestId: z.string().nullable(),
  lastMessageAt: isoDateTime.nullable(),
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number().int(),
  createdAt: isoDateTime,
});
export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatThreadListResponseSchema = z.object({
  items: z.array(chatThreadSchema),
  nextCursor: z.string().nullable(),
});
export type ChatThreadListResponse = z.infer<typeof chatThreadListResponseSchema>;

export const chatMessageListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  senderUserId: z.string(),
  body: z.string(),
  attachments: z.unknown().nullable(),
  systemKind: z.string().nullable(),
  systemPayload: z.unknown().nullable(),
  editedAt: isoDateTime.nullable(),
  deletedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessageListResponseSchema = z.object({
  items: z.array(chatMessageSchema),
  nextCursor: z.string().nullable(),
});
export type ChatMessageListResponse = z.infer<typeof chatMessageListResponseSchema>;

export const chatMessageCreateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachments: z.array(z.unknown()).optional(),
});
export type ChatMessageCreate = z.infer<typeof chatMessageCreateSchema>;

export const directThreadCreateSchema = z.object({
  /** Other user — agency-scoped chat is not enforced here; PLAN §6 plan-tier
   *  gates wrap this at the route boundary in Sprint 7 if needed. */
  otherUserId: z.string().min(1),
});
export type DirectThreadCreate = z.infer<typeof directThreadCreateSchema>;

export const chatMarkReadSchema = z.object({
  /** Last message id read by the caller; server clamps to the latest available. */
  lastReadMessageId: z.string().min(1).optional(),
});
export type ChatMarkRead = z.infer<typeof chatMarkReadSchema>;
