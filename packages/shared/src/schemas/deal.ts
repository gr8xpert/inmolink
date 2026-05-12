import { z } from "zod";

/**
 * Deal schemas (PLAN §11.6 + §1 row 21).
 *
 * The handshake flow:
 *  1. Either party submits a deal proposal (price + closing date) on a
 *     COMPLETED ViewingRequest.
 *  2. Status starts at PENDING_OWNER or PENDING_INTRODUCER (whichever side
 *     still needs to confirm), depending on who submitted.
 *  3. The other party either confirms (→ CONFIRMED) or disputes (→ DISPUTED,
 *     escalated to super-admin queue).
 *  4. CANCELLED is reachable while still PENDING_*.
 *
 * Commission% + introducerShare% are snapshotted from the listing agency's
 * AgencySettings at submit time (per-deal can override) so the split survives
 * later policy changes.
 */

export const dealStatusSchema = z.enum([
  "PENDING_BOTH",
  "PENDING_OWNER",
  "PENDING_INTRODUCER",
  "CONFIRMED",
  "DISPUTED",
  "CANCELLED",
]);
export type DealStatus = z.infer<typeof dealStatusSchema>;

const isoDateTime = z.string().datetime();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const pctSchema = z.coerce.number().min(0).max(100);

/** Submitted by either party. The server snapshots commission/share if absent. */
export const dealCreateSchema = z.object({
  viewingRequestId: z.string().min(1),
  /** Final agreed price; integer cents on the wire. */
  agreedPriceCents: z.coerce.number().int().min(1),
  currency: z.string().length(3).default("EUR"),
  /** Per-deal overrides; default to AgencySettings on the owning agency. */
  commissionPct: pctSchema.optional(),
  introducerSharePct: pctSchema.optional(),
  /** Optional ISO date (yyyy-mm-dd). */
  closingDate: isoDate.optional(),
  message: z.string().trim().max(1000).optional(),
});
export type DealCreate = z.infer<typeof dealCreateSchema>;

export const dealConfirmSchema = z.object({
  message: z.string().trim().max(1000).optional(),
});
export type DealConfirm = z.infer<typeof dealConfirmSchema>;

export const dealDisputeSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});
export type DealDispute = z.infer<typeof dealDisputeSchema>;

export const dealResolveDisputeSchema = z.object({
  /** Free-text resolution notes. The decision itself is captured in `outcome`. */
  notes: z.string().trim().min(5).max(2000),
  /** Where to land the deal: confirmed accepts the existing snapshot,
   *  cancelled discards. */
  outcome: z.enum(["CONFIRMED", "CANCELLED"]),
});
export type DealResolveDispute = z.infer<typeof dealResolveDisputeSchema>;

export const dealListQuerySchema = z.object({
  status: dealStatusSchema.optional(),
  role: z.enum(["owner", "introducer"]).optional(),
  cursor: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DealListQuery = z.infer<typeof dealListQuerySchema>;

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
});

export const dealSchema = z.object({
  id: z.string(),
  viewingRequestId: z.string(),
  property: propertySummarySchema,
  owner: userSummarySchema,
  introducer: userSummarySchema,
  ownerAgencyId: z.string(),
  introducerAgencyId: z.string().nullable(),
  agreedPriceCents: z.string(), // BigInt → string
  currency: z.string(),
  commissionPct: z.string(), // Decimal → string
  introducerSharePct: z.string(),
  totalCommissionCents: z.string(),
  ownerAmountCents: z.string(),
  introducerAmountCents: z.string(),
  status: dealStatusSchema,
  ownerSubmittedAt: isoDateTime.nullable(),
  introducerSubmittedAt: isoDateTime.nullable(),
  ownerConfirmedAt: isoDateTime.nullable(),
  introducerConfirmedAt: isoDateTime.nullable(),
  disputeOpenedAt: isoDateTime.nullable(),
  disputeOpenedById: z.string().nullable(),
  disputeReason: z.string().nullable(),
  disputeResolvedAt: isoDateTime.nullable(),
  disputeResolvedById: z.string().nullable(),
  closingDate: isoDate.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  callerActions: z.object({
    canConfirm: z.boolean(),
    canDispute: z.boolean(),
    canCancel: z.boolean(),
    canResolveDispute: z.boolean(),
  }),
});
export type Deal = z.infer<typeof dealSchema>;

export const dealListResponseSchema = z.object({
  items: z.array(dealSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nullable(),
  page: z.number().int().nullable(),
  pageSize: z.number().int().nullable(),
  totalPages: z.number().int().nullable(),
});
export type DealListResponse = z.infer<typeof dealListResponseSchema>;
