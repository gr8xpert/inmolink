import { prisma } from "@inmolink/db";
import type { dealSchemas } from "@inmolink/shared";
import { Prisma } from "@prisma/client";
import { emitWebhookEvent } from "../../lib/webhooks";
import { createNotification } from "../notifications/service";

/**
 * Deal handshake (PLAN §11.6 + §1 row 21).
 *
 * Submit lifecycle:
 *  - Submitter records ownerSubmittedAt / introducerSubmittedAt.
 *  - Status transitions to PENDING_<otherSide> if first submission.
 *  - When the other side confirms, both *ConfirmedAt are set and status
 *    flips to CONFIRMED.
 *  - Either side can dispute → DISPUTED + super-admin notified.
 *  - Either side can cancel while PENDING_*.
 *
 * Money math is done with BigInt cents to avoid float drift. Pct is stored
 * as Prisma Decimal — we round half-even to the nearest cent.
 */

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "DEAL_NOT_FOUND";
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "DEAL_FORBIDDEN";
}

export class InvalidStateError extends Error {
  readonly statusCode = 422;
  readonly code = "DEAL_INVALID_STATE";
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "DEAL_CONFLICT";
}

export type Caller = {
  userId: string;
  agencyId: string | null;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
};

const DEAL_INCLUDE = {
  property: {
    select: {
      id: true,
      translations: { select: { locale: true, title: true, slug: true } },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true, slug: true, agencyId: true } },
  introducer: {
    select: { id: true, firstName: true, lastName: true, slug: true, agencyId: true },
  },
} as const satisfies Prisma.DealInclude;

type RawDeal = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>;

function pickTitle(translations: Array<{ locale: string; title: string; slug: string }>) {
  const t = translations.find((t) => t.locale === "en") ?? translations[0];
  return t ? { title: t.title, slug: t.slug } : { title: null, slug: null };
}

function isParty(caller: Caller, row: { ownerUserId: string; introducerUserId: string }): boolean {
  return caller.userId === row.ownerUserId || caller.userId === row.introducerUserId;
}

function callerActions(row: RawDeal, caller: Caller): dealSchemas.Deal["callerActions"] {
  const isOwner = caller.userId === row.ownerUserId;
  const isIntro = caller.userId === row.introducerUserId;
  const party = isOwner || isIntro;
  const sa = caller.role === "SUPER_ADMIN";

  // canConfirm: caller has not yet confirmed and the deal is still pending
  const ownerNeedsConfirm = !row.ownerConfirmedAt;
  const introNeedsConfirm = !row.introducerConfirmedAt;
  const stillPending =
    row.status === "PENDING_BOTH" ||
    row.status === "PENDING_OWNER" ||
    row.status === "PENDING_INTRODUCER";

  return {
    canConfirm: stillPending && ((isOwner && ownerNeedsConfirm) || (isIntro && introNeedsConfirm)),
    canDispute: party && (stillPending || row.status === "CONFIRMED"),
    canCancel: party && stillPending,
    canResolveDispute: sa && row.status === "DISPUTED",
  };
}

function toResponse(row: RawDeal, caller: Caller): dealSchemas.Deal {
  const title = pickTitle(row.property.translations);
  return {
    id: row.id,
    viewingRequestId: row.viewingRequestId,
    property: {
      id: row.property.id,
      title: title.title,
      slug: title.slug,
    },
    owner: {
      id: row.owner.id,
      firstName: row.owner.firstName,
      lastName: row.owner.lastName,
      slug: row.owner.slug,
      agencyId: row.owner.agencyId,
    },
    introducer: {
      id: row.introducer.id,
      firstName: row.introducer.firstName,
      lastName: row.introducer.lastName,
      slug: row.introducer.slug,
      agencyId: row.introducer.agencyId,
    },
    ownerAgencyId: row.ownerAgencyId,
    introducerAgencyId: row.introducerAgencyId,
    agreedPriceCents: row.agreedPriceCents.toString(),
    currency: row.currency,
    commissionPct: row.commissionPct.toString(),
    introducerSharePct: row.introducerSharePct.toString(),
    totalCommissionCents: row.totalCommissionCents.toString(),
    ownerAmountCents: row.ownerAmountCents.toString(),
    introducerAmountCents: row.introducerAmountCents.toString(),
    status: row.status,
    ownerSubmittedAt: row.ownerSubmittedAt?.toISOString() ?? null,
    introducerSubmittedAt: row.introducerSubmittedAt?.toISOString() ?? null,
    ownerConfirmedAt: row.ownerConfirmedAt?.toISOString() ?? null,
    introducerConfirmedAt: row.introducerConfirmedAt?.toISOString() ?? null,
    disputeOpenedAt: row.disputeOpenedAt?.toISOString() ?? null,
    disputeOpenedById: row.disputeOpenedById,
    disputeReason: row.disputeReason,
    disputeResolvedAt: row.disputeResolvedAt?.toISOString() ?? null,
    disputeResolvedById: row.disputeResolvedById,
    closingDate: row.closingDate ? row.closingDate.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    callerActions: callerActions(row, caller),
  };
}

/**
 * Cents math: total = price * commission/100; introducer = total * share/100;
 * owner = total - introducer. Half-even rounded to the nearest cent.
 */
function computeAmounts(args: {
  agreedPriceCents: bigint;
  commissionPct: Prisma.Decimal;
  introducerSharePct: Prisma.Decimal;
}): { total: bigint; introducer: bigint; owner: bigint } {
  // Convert pct → ratio with 4 decimal places of precision (i.e. * 10_000)
  const num = (d: Prisma.Decimal) => BigInt(d.times(10_000).round().toString());
  const c = num(args.commissionPct); // commission% * 10_000
  const s = num(args.introducerSharePct); // share% * 10_000

  // total = price * c / (10_000 * 100)
  const totalNum = args.agreedPriceCents * c;
  const totalDen = 1_000_000n; // 10_000 (pct scale) * 100 (% → ratio)
  const total = (totalNum + totalDen / 2n) / totalDen; // round half-up

  const introNum = total * s;
  const introDen = 1_000_000n;
  const introducer = (introNum + introDen / 2n) / introDen;
  const owner = total - introducer;
  return { total, introducer, owner };
}

function decodeCursor(c: string | undefined): { createdAt: string; id: string } | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as {
      createdAt: string;
      id: string;
    };
  } catch {
    return null;
  }
}

function encodeCursor(args: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(args)).toString("base64url");
}

// ---------------------------------------------------------------------------

export async function createDeal(
  caller: Caller,
  input: dealSchemas.DealCreate,
): Promise<dealSchemas.Deal> {
  // Resolve the viewing request and validate state.
  const vr = await prisma.viewingRequest.findUnique({
    where: { id: input.viewingRequestId },
    select: {
      id: true,
      status: true,
      outcome: true,
      ownerUserId: true,
      introducerUserId: true,
      introducerAgencyId: true,
      property: { select: { id: true, ownerAgencyId: true } },
      deal: { select: { id: true } },
    },
  });
  if (!vr) throw new NotFoundError("Viewing request not found.");
  if (!isParty(caller, vr) && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only parties to the viewing can submit a deal.");
  }
  if (vr.status !== "COMPLETED") {
    throw new InvalidStateError("Deal can only be submitted on a completed viewing.");
  }
  if (vr.outcome !== "OFFER_MADE" && vr.outcome !== "SOLD" && vr.outcome !== "RENTED") {
    throw new InvalidStateError(
      "Deal can only be submitted when the viewing outcome is offer-made, sold, or rented.",
    );
  }
  if (vr.deal) throw new ConflictError("A deal already exists for this viewing.");

  // Snapshot commission + share from agency settings unless the caller overrode.
  const settings = await prisma.agencySettings.findUnique({
    where: { agencyId: vr.property.ownerAgencyId },
    select: { defaultCommissionPct: true, defaultIntroducerSharePct: true },
  });
  const commissionPct =
    input.commissionPct !== undefined
      ? new Prisma.Decimal(input.commissionPct)
      : (settings?.defaultCommissionPct ?? new Prisma.Decimal("5.00"));
  const introducerSharePct =
    input.introducerSharePct !== undefined
      ? new Prisma.Decimal(input.introducerSharePct)
      : (settings?.defaultIntroducerSharePct ?? new Prisma.Decimal("50.00"));

  const agreedPriceCents = BigInt(input.agreedPriceCents);
  const amounts = computeAmounts({ agreedPriceCents, commissionPct, introducerSharePct });

  const isOwnerSubmitting = caller.userId === vr.ownerUserId;
  const isIntroSubmitting = caller.userId === vr.introducerUserId;
  // Status reflects who *still* needs to confirm.
  const status: "PENDING_INTRODUCER" | "PENDING_OWNER" = isOwnerSubmitting
    ? "PENDING_INTRODUCER"
    : "PENDING_OWNER";

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.deal.create({
      data: {
        viewingRequestId: vr.id,
        propertyId: vr.property.id,
        ownerUserId: vr.ownerUserId,
        introducerUserId: vr.introducerUserId,
        ownerAgencyId: vr.property.ownerAgencyId,
        introducerAgencyId: vr.introducerAgencyId,
        agreedPriceCents,
        currency: input.currency,
        commissionPct,
        introducerSharePct,
        totalCommissionCents: amounts.total,
        ownerAmountCents: amounts.owner,
        introducerAmountCents: amounts.introducer,
        status,
        ownerSubmittedAt: isOwnerSubmitting ? new Date() : null,
        introducerSubmittedAt: isIntroSubmitting ? new Date() : null,
        // Submitting also auto-confirms your side.
        ownerConfirmedAt: isOwnerSubmitting ? new Date() : null,
        introducerConfirmedAt: isIntroSubmitting ? new Date() : null,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
      },
      include: DEAL_INCLUDE,
    });
    const otherUserId = isOwnerSubmitting ? vr.introducerUserId : vr.ownerUserId;
    await createNotification(tx, {
      userId: otherUserId,
      kind: "DEAL_SUBMITTED",
      targetKind: "Deal",
      targetId: row.id,
      payload: {
        agreedPriceCents: input.agreedPriceCents,
        currency: input.currency,
        message: input.message ?? null,
      },
    });
    return row;
  });
  return toResponse(created, caller);
}

export async function listDeals(
  caller: Caller,
  query: dealSchemas.DealListQuery,
): Promise<dealSchemas.DealListResponse> {
  const where: Prisma.DealWhereInput = {};
  if (caller.role !== "SUPER_ADMIN") {
    if (query.role === "owner") where.ownerUserId = caller.userId;
    else if (query.role === "introducer") where.introducerUserId = caller.userId;
    else where.OR = [{ ownerUserId: caller.userId }, { introducerUserId: caller.userId }];
  }
  if (query.status) where.status = query.status;

  const cursor = decodeCursor(query.cursor);
  const cursorClause: Prisma.DealWhereInput | null = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : null;

  const rows = await prisma.deal.findMany({
    where: cursorClause ? { AND: [where, cursorClause] } : where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: DEAL_INCLUDE,
  });
  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor =
    hasMore && tail
      ? Buffer.from(
          JSON.stringify({ createdAt: tail.createdAt.toISOString(), id: tail.id }),
        ).toString("base64url")
      : null;
  return { items: slice.map((r) => toResponse(r, caller)), nextCursor };
}

export async function getDeal(caller: Caller, id: string): Promise<dealSchemas.Deal> {
  const row = await prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
  if (!row) throw new NotFoundError("Deal not found.");
  if (!isParty(caller, row) && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Not authorised to view this deal.");
  }
  return toResponse(row, caller);
}

async function loadAndAssertParty(caller: Caller, id: string): Promise<RawDeal> {
  const row = await prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
  if (!row) throw new NotFoundError("Deal not found.");
  if (!isParty(caller, row) && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Not authorised to act on this deal.");
  }
  return row;
}

export async function confirmDeal(
  caller: Caller,
  id: string,
  _input: dealSchemas.DealConfirm,
): Promise<dealSchemas.Deal> {
  const row = await loadAndAssertParty(caller, id);
  if (
    row.status !== "PENDING_OWNER" &&
    row.status !== "PENDING_INTRODUCER" &&
    row.status !== "PENDING_BOTH"
  ) {
    throw new InvalidStateError("Deal not awaiting confirmation.");
  }
  const isOwner = caller.userId === row.ownerUserId;
  const isIntro = caller.userId === row.introducerUserId;
  if (!isOwner && !isIntro) {
    throw new ForbiddenError("Only parties may confirm.");
  }

  const now = new Date();
  const data: Prisma.DealUpdateInput = {};
  if (isOwner && !row.ownerConfirmedAt) data.ownerConfirmedAt = now;
  if (isIntro && !row.introducerConfirmedAt) data.introducerConfirmedAt = now;

  // Re-derive status: are both sides confirmed now?
  const willOwnerBeConfirmed = !!(row.ownerConfirmedAt || (isOwner && !row.ownerConfirmedAt));
  const willIntroBeConfirmed = !!(
    row.introducerConfirmedAt ||
    (isIntro && !row.introducerConfirmedAt)
  );
  if (willOwnerBeConfirmed && willIntroBeConfirmed) {
    data.status = "CONFIRMED";
  } else if (willOwnerBeConfirmed) {
    data.status = "PENDING_INTRODUCER";
  } else if (willIntroBeConfirmed) {
    data.status = "PENDING_OWNER";
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.deal.update({ where: { id }, data, include: DEAL_INCLUDE });
    if (next.status === "CONFIRMED") {
      // Notify both parties of CONFIRMED state
      await tx.notification.createMany({
        data: [
          {
            userId: row.ownerUserId,
            kind: "DEAL_CONFIRMED",
            targetKind: "Deal",
            targetId: row.id,
          },
          {
            userId: row.introducerUserId,
            kind: "DEAL_CONFIRMED",
            targetKind: "Deal",
            targetId: row.id,
          },
        ],
      });
      // Emit on the listing-agency side; the introducer agency may also
      // want a copy but we'd need to dedup if both subscribe. v1 keeps it
      // on the owner agency only.
      if (next.ownerAgencyId) {
        await emitWebhookEvent(tx, {
          type: "DEAL_CONFIRMED",
          agencyId: next.ownerAgencyId,
          payload: {
            dealId: row.id,
            propertyId: row.propertyId,
            agreedPriceCents: next.agreedPriceCents.toString(),
            currency: next.currency,
          },
        });
      }
    } else {
      // Just nudge the side that still owes confirmation
      const otherUserId = isOwner ? row.introducerUserId : row.ownerUserId;
      await createNotification(tx, {
        userId: otherUserId,
        kind: "DEAL_SUBMITTED",
        targetKind: "Deal",
        targetId: row.id,
      });
    }
    return next;
  });
  return toResponse(updated, caller);
}

export async function disputeDeal(
  caller: Caller,
  id: string,
  input: dealSchemas.DealDispute,
): Promise<dealSchemas.Deal> {
  const row = await loadAndAssertParty(caller, id);
  if (row.status === "CANCELLED" || row.status === "DISPUTED") {
    throw new InvalidStateError("Deal already in a terminal/disputed state.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.deal.update({
      where: { id },
      data: {
        status: "DISPUTED",
        disputeOpenedAt: new Date(),
        disputeOpenedById: caller.userId,
        disputeReason: input.reason,
      },
      include: DEAL_INCLUDE,
    });
    // Notify the other party
    const otherUserId = caller.userId === row.ownerUserId ? row.introducerUserId : row.ownerUserId;
    await createNotification(tx, {
      userId: otherUserId,
      kind: "DEAL_DISPUTED",
      targetKind: "Deal",
      targetId: row.id,
      payload: { reason: input.reason },
    });
    // Notify all super-admins (queue surface — they pull /admin/disputes)
    const superAdmins = await tx.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true },
    });
    if (superAdmins.length > 0) {
      await tx.notification.createMany({
        data: superAdmins.map((u) => ({
          userId: u.id,
          kind: "DEAL_DISPUTED" as const,
          targetKind: "Deal",
          targetId: row.id,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        type: "DEAL_DISPUTED",
        actorUserId: caller.userId,
        targetKind: "Deal",
        targetId: row.id,
        agencyId: row.ownerAgencyId,
        metadata: { reason: input.reason },
      },
    });
    if (row.ownerAgencyId) {
      await emitWebhookEvent(tx, {
        type: "DEAL_DISPUTED",
        agencyId: row.ownerAgencyId,
        payload: {
          dealId: row.id,
          propertyId: row.propertyId,
          reason: input.reason,
          openedByUserId: caller.userId,
        },
      });
    }
    return next;
  });
  return toResponse(updated, caller);
}

export async function cancelDeal(caller: Caller, id: string): Promise<dealSchemas.Deal> {
  const row = await loadAndAssertParty(caller, id);
  if (
    row.status !== "PENDING_OWNER" &&
    row.status !== "PENDING_INTRODUCER" &&
    row.status !== "PENDING_BOTH"
  ) {
    throw new InvalidStateError("Only pending deals can be cancelled.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.deal.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: DEAL_INCLUDE,
    });
    const otherUserId = caller.userId === row.ownerUserId ? row.introducerUserId : row.ownerUserId;
    await createNotification(tx, {
      userId: otherUserId,
      kind: "DEAL_DISPUTE_RESOLVED",
      targetKind: "Deal",
      targetId: row.id,
      payload: { resolution: "CANCELLED" },
    });
    return next;
  });
  return toResponse(updated, caller);
}

export async function listDisputes(
  _caller: Caller,
  query: { cursor?: string; limit: number },
): Promise<dealSchemas.DealListResponse> {
  // SUPER_ADMIN-only — guarded by the route. Caller passed only for shape.
  const where: Prisma.DealWhereInput = { status: "DISPUTED" };
  const cursor = decodeCursor(query.cursor);
  const cursorClause: Prisma.DealWhereInput | null = cursor
    ? {
        OR: [
          { disputeOpenedAt: { lt: new Date(cursor.createdAt) } },
          {
            disputeOpenedAt: new Date(cursor.createdAt),
            id: { lt: cursor.id },
          },
        ],
      }
    : null;
  const rows = await prisma.deal.findMany({
    where: cursorClause ? { AND: [where, cursorClause] } : where,
    orderBy: [{ disputeOpenedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: DEAL_INCLUDE,
  });
  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor =
    hasMore && tail && tail.disputeOpenedAt
      ? encodeCursor({ createdAt: tail.disputeOpenedAt.toISOString(), id: tail.id })
      : null;
  return { items: slice.map((r) => toResponse(r, _caller)), nextCursor };
}

export async function resolveDispute(
  caller: Caller,
  id: string,
  input: dealSchemas.DealResolveDispute,
): Promise<dealSchemas.Deal> {
  if (caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only super-admin can resolve disputes.");
  }
  const row = await prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
  if (!row) throw new NotFoundError("Deal not found.");
  if (row.status !== "DISPUTED") {
    throw new InvalidStateError("Deal not in dispute.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.deal.update({
      where: { id },
      data: {
        status: input.outcome,
        disputeResolvedAt: new Date(),
        disputeResolvedById: caller.userId,
      },
      include: DEAL_INCLUDE,
    });
    const data = [
      {
        userId: row.ownerUserId,
        kind: "DEAL_DISPUTE_RESOLVED" as const,
        targetKind: "Deal",
        targetId: row.id,
        payload: { resolution: input.outcome, notes: input.notes } as Prisma.InputJsonValue,
      },
      {
        userId: row.introducerUserId,
        kind: "DEAL_DISPUTE_RESOLVED" as const,
        targetKind: "Deal",
        targetId: row.id,
        payload: { resolution: input.outcome, notes: input.notes } as Prisma.InputJsonValue,
      },
    ];
    await tx.notification.createMany({ data });
    await tx.auditLog.create({
      data: {
        type: "DEAL_DISPUTE_RESOLVED",
        actorUserId: caller.userId,
        targetKind: "Deal",
        targetId: row.id,
        agencyId: row.ownerAgencyId,
        metadata: { resolution: input.outcome, notes: input.notes },
      },
    });
    return next;
  });
  return toResponse(updated, caller);
}
