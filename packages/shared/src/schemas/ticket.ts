import { z } from "zod";

/** Sprint 9. Tickets — agent ↔ super-admin support thread. */

export const ticketCategorySchema = z.enum([
  "BUG",
  "FEATURE_REQUEST",
  "BILLING",
  "ACCOUNT",
  "OTHER",
]);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const ticketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const ticketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

// ---- Attachments ----

export const ticketAttachmentSchema = z.object({
  mediaObjectId: z.string().min(1),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(127),
  url: z.string().url().optional(),
});
export type TicketAttachment = z.infer<typeof ticketAttachmentSchema>;

// ---- Ticket ----

export const ticketCreateSchema = z.object({
  subject: z.string().min(3).max(255),
  category: ticketCategorySchema.default("OTHER"),
  priority: ticketPrioritySchema.default("NORMAL"),
  body: z.string().min(1).max(10_000),
  attachments: z.array(ticketAttachmentSchema).max(5).optional().default([]),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export const ticketReplySchema = z.object({
  body: z.string().min(1).max(10_000),
  attachments: z.array(ticketAttachmentSchema).max(5).optional().default([]),
  isInternal: z.boolean().default(false),
});
export type TicketReplyInput = z.infer<typeof ticketReplySchema>;

export const ticketAssignSchema = z.object({
  assignedToId: z.string().nullable(),
});

export const ticketStatusChangeSchema = z.object({
  status: ticketStatusSchema,
});

// ---- Output ----

export const ticketAuthorSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.string(),
});

export const ticketMessageSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  author: ticketAuthorSchema,
  body: z.string(),
  attachments: z.array(ticketAttachmentSchema),
  isInternal: z.boolean(),
  createdAt: z.string(),
});
export type TicketMessage = z.infer<typeof ticketMessageSchema>;

export const ticketSummarySchema = z.object({
  id: z.string(),
  number: z.number().int(),
  subject: z.string(),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  openedById: z.string(),
  agencyId: z.string().nullable(),
  agencyName: z.string().nullable(),
  assignedToId: z.string().nullable(),
  assignedToName: z.string().nullable(),
  openedByName: z.string(),
  lastActivityAt: z.string(),
  createdAt: z.string(),
  messageCount: z.number().int(),
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketDetailSchema = ticketSummarySchema.extend({
  messages: z.array(ticketMessageSchema),
  callerActions: z.object({
    canReply: z.boolean(),
    canAssign: z.boolean(),
    canChangeStatus: z.boolean(),
    canSeeInternal: z.boolean(),
  }),
});
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

export const ticketListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  // SUPER_ADMIN-only filters
  assignedToId: z.string().optional(),
  agencyId: z.string().optional(),
  q: z.string().optional(),
});

export const ticketListResponseSchema = z.object({
  items: z.array(ticketSummarySchema),
  nextCursor: z.string().nullable(),
});
