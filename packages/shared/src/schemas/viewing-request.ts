import { z } from "zod";

/**
 * ViewingRequest schemas (PLAN §11.6). Client info on the wire is plaintext;
 * the api AES-256-GCM-encrypts it at rest with `env.ENCRYPTION_KEY` (PLAN §9.3).
 */

export const viewingStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
  "EXPIRED",
]);
export type ViewingStatus = z.infer<typeof viewingStatusSchema>;

export const viewingOutcomeSchema = z.enum([
  "NO_INTEREST",
  "INTERESTED",
  "OFFER_MADE",
  "SOLD",
  "RENTED",
]);
export type ViewingOutcome = z.infer<typeof viewingOutcomeSchema>;

const isoDateTime = z.string().datetime();

const clientNameSchema = z.string().trim().min(1).max(120);
const clientEmailSchema = z.string().trim().toLowerCase().email().max(254);
const clientPhoneSchema = z.string().trim().min(3).max(40);
const clientNotesSchema = z.string().trim().max(2000);

export const viewingRequestCreateSchema = z.object({
  propertyId: z.string().min(1),
  /** ISO datetimes for up to 3 candidate slots the introducer can cover. */
  preferredDates: z.array(isoDateTime).min(1).max(3),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  meetingPoint: z.string().trim().max(200).optional(),
  /** Free-text the introducer wants the owner to see (questions, context). */
  introducerMessage: z.string().trim().max(1000).optional(),
  /** Plaintext client info — encrypted at rest (PLAN §9.3). */
  client: z.object({
    name: clientNameSchema,
    email: clientEmailSchema.optional(),
    phone: clientPhoneSchema.optional(),
    notes: clientNotesSchema.optional(),
  }),
});
export type ViewingRequestCreate = z.infer<typeof viewingRequestCreateSchema>;

/** Owner-side action (accept). One concrete slot must be picked. */
export const viewingRequestAcceptSchema = z.object({
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(15).max(240).optional(),
  meetingPoint: z.string().trim().max(200).optional(),
  responseMessage: z.string().trim().max(1000).optional(),
});
export type ViewingRequestAccept = z.infer<typeof viewingRequestAcceptSchema>;

export const viewingRequestDeclineSchema = z.object({
  responseMessage: z.string().trim().max(1000).optional(),
});
export type ViewingRequestDecline = z.infer<typeof viewingRequestDeclineSchema>;

/** Either party can propose a reschedule before the viewing happens. */
export const viewingRequestRescheduleSchema = z.object({
  scheduledAt: isoDateTime,
  meetingPoint: z.string().trim().max(200).optional(),
  responseMessage: z.string().trim().max(1000).optional(),
});
export type ViewingRequestReschedule = z.infer<typeof viewingRequestRescheduleSchema>;

/** Owner records the post-visit outcome. Drives Deal flow downstream. */
export const viewingRequestOutcomeSchema = z.object({
  outcome: viewingOutcomeSchema,
  notes: z.string().trim().max(2000).optional(),
});
export type ViewingRequestOutcome = z.infer<typeof viewingRequestOutcomeSchema>;

export const viewingRequestListQuerySchema = z.object({
  status: viewingStatusSchema.optional(),
  /** "owner" → requests *I* received as listing agent. "introducer" →
   *  requests *I* made on someone else's listing. omit → both. */
  role: z.enum(["owner", "introducer"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ViewingRequestListQuery = z.infer<typeof viewingRequestListQuerySchema>;

const userSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  slug: z.string(),
  agencyId: z.string().nullable(),
});

const propertySummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  priceCents: z.string(), // BigInt → string on the wire
  currency: z.string(),
  transactionType: z.enum(["sale", "rent", "rentlong", "rentshort"]),
  coverImageUrl: z.string().url().nullable(),
});

/** Decrypted shape — only returned to authorised parties (owner / introducer / super-admin). */
const clientPlainSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
});

export const viewingRequestSchema = z.object({
  id: z.string(),
  property: propertySummarySchema,
  owner: userSummarySchema,
  introducer: userSummarySchema,
  status: viewingStatusSchema,
  outcome: viewingOutcomeSchema.nullable(),
  preferredDates: z.array(isoDateTime),
  scheduledAt: isoDateTime.nullable(),
  durationMinutes: z.number().int().nullable(),
  meetingPoint: z.string().nullable(),
  client: clientPlainSchema,
  chatThreadId: z.string().nullable(),
  expiresAt: isoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** Available actions for the caller, server-computed; powers the UI buttons. */
  callerActions: z.object({
    canAccept: z.boolean(),
    canDecline: z.boolean(),
    canReschedule: z.boolean(),
    canCancel: z.boolean(),
    canSetOutcome: z.boolean(),
    canSubmitDeal: z.boolean(),
  }),
});
export type ViewingRequest = z.infer<typeof viewingRequestSchema>;

export const viewingRequestListResponseSchema = z.object({
  items: z.array(viewingRequestSchema),
  nextCursor: z.string().nullable(),
});
export type ViewingRequestListResponse = z.infer<typeof viewingRequestListResponseSchema>;
