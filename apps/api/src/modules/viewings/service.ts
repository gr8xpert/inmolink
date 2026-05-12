import { decryptFromString, encryptToString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { viewingRequestSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Prisma, ViewingStatus } from "@prisma/client";
import { emitWebhookEvent } from "../../lib/webhooks";
import { createNotification } from "../notifications/service";

/**
 * ViewingRequest workflow (PLAN §11.6).
 *
 * Status machine (see schema §7):
 *
 *   PENDING ──accept──▶ ACCEPTED ──setOutcome──▶ COMPLETED
 *      │                    │
 *      ├─decline──▶ DECLINED│
 *      ├─cancel ──▶ CANCELLED
 *      ├─reschedule (either side)──▶ RESCHEDULED ──accept──▶ ACCEPTED
 *      └─auto-expire (worker)──▶ EXPIRED
 *
 * Client info (name/email/phone/notes) is AES-256-GCM-encrypted at rest with
 * `env.ENCRYPTION_KEY`. Only the listing agent (owner), the requesting agent
 * (introducer) and SUPER_ADMIN can decrypt — all reads go through this service
 * which decrypts only after the visibility check.
 */

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "VIEWING_NOT_FOUND";
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "VIEWING_FORBIDDEN";
}

export class InvalidStateError extends Error {
  readonly statusCode = 422;
  readonly code = "VIEWING_INVALID_STATE";
  constructor(
    readonly status: ViewingStatus,
    action: string,
  ) {
    super(`Viewing in status ${status} cannot be ${action}.`);
  }
}

export type Caller = {
  userId: string;
  agencyId: string | null;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
};

type EncryptedClient = {
  clientNameEnc: string;
  clientEmailEnc: string | null;
  clientPhoneEnc: string | null;
  clientNotesEnc: string | null;
};

function keyBuf(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function encryptClient(
  input: viewingRequestSchemas.ViewingRequestCreate["client"],
  hexKey: string,
): EncryptedClient {
  const k = keyBuf(hexKey);
  return {
    clientNameEnc: encryptToString(input.name, k),
    clientEmailEnc: input.email ? encryptToString(input.email, k) : null,
    clientPhoneEnc: input.phone ? encryptToString(input.phone, k) : null,
    clientNotesEnc: input.notes ? encryptToString(input.notes, k) : null,
  };
}

function decryptClient(row: EncryptedClient, hexKey: string) {
  const k = keyBuf(hexKey);
  return {
    name: decryptFromString(row.clientNameEnc, k),
    email: row.clientEmailEnc ? decryptFromString(row.clientEmailEnc, k) : null,
    phone: row.clientPhoneEnc ? decryptFromString(row.clientPhoneEnc, k) : null,
    notes: row.clientNotesEnc ? decryptFromString(row.clientNotesEnc, k) : null,
  };
}

const REQUEST_INCLUDE = {
  property: {
    select: {
      id: true,
      transactionType: true,
      priceCents: true,
      currency: true,
      ownerUserId: true,
      ownerAgencyId: true,
      images: {
        where: { isCover: true },
        take: 1,
        select: { mediaObject: { select: { r2Key: true } } },
      },
      translations: { select: { locale: true, title: true, slug: true } },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true, slug: true, agencyId: true } },
  introducer: {
    select: { id: true, firstName: true, lastName: true, slug: true, agencyId: true },
  },
} as const satisfies Prisma.ViewingRequestInclude;

type RawRequest = Prisma.ViewingRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

/** Whether `caller` can see this request at all (= read or take any action). */
function canAccess(
  caller: Caller,
  row: { ownerUserId: string; introducerUserId: string },
): boolean {
  if (caller.role === "SUPER_ADMIN") return true;
  return row.ownerUserId === caller.userId || row.introducerUserId === caller.userId;
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

function pickTitle(translations: Array<{ locale: string; title: string; slug: string }>): {
  title: string | null;
  slug: string | null;
} {
  const t = translations.find((t) => t.locale === "en") ?? translations[0];
  return t ? { title: t.title, slug: t.slug } : { title: null, slug: null };
}

function actions(
  row: RawRequest,
  caller: Caller,
): viewingRequestSchemas.ViewingRequest["callerActions"] {
  const isOwner = caller.userId === row.ownerUserId;
  const isIntroducer = caller.userId === row.introducerUserId;
  const isParty = isOwner || isIntroducer;
  const isOpenForChange = row.status === "PENDING" || row.status === "RESCHEDULED";
  const isAccepted = row.status === "ACCEPTED";
  const passedScheduled = row.scheduledAt !== null && row.scheduledAt < new Date();

  return {
    canAccept: isParty && isOwner && isOpenForChange,
    canDecline: isParty && isOwner && isOpenForChange,
    // Either party can propose a reschedule while still open.
    canReschedule: isParty && isOpenForChange,
    canCancel:
      isParty &&
      (row.status === "PENDING" || row.status === "ACCEPTED" || row.status === "RESCHEDULED"),
    canSetOutcome: isParty && isOwner && isAccepted && passedScheduled,
    canSubmitDeal:
      isParty &&
      row.status === "COMPLETED" &&
      (row.outcome === "OFFER_MADE" || row.outcome === "SOLD" || row.outcome === "RENTED"),
  };
}

function toResponse(
  row: RawRequest,
  caller: Caller,
  hexKey: string,
  storage: Storage,
): viewingRequestSchemas.ViewingRequest {
  const t = pickTitle(row.property.translations);
  const cover = row.property.images[0]?.mediaObject;
  return {
    id: row.id,
    property: {
      id: row.property.id,
      title: t.title,
      slug: t.slug,
      priceCents: row.property.priceCents.toString(),
      currency: row.property.currency,
      transactionType: row.property.transactionType as "sale" | "rent" | "rentlong" | "rentshort",
      coverImageUrl: cover ? storage.publicUrl(cover.r2Key) : null,
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
    status: row.status,
    outcome: row.outcome,
    preferredDates: ((row.preferredDates as string[] | null) ?? []).map((d) =>
      new Date(d).toISOString(),
    ),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    meetingPoint: row.meetingPoint,
    client: decryptClient(row, hexKey),
    chatThreadId: row.chatThreadId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    callerActions: actions(row, caller),
  };
}

/**
 * Atomically gets-or-creates the unique direct/viewing thread between two
 * users. Used when a viewing is accepted (kind=VIEWING) and could be reused
 * for the user-initiated direct message flow.
 */
async function getOrCreateViewingThread(
  tx: Prisma.TransactionClient,
  args: { ownerUserId: string; introducerUserId: string },
): Promise<string> {
  const [a, b] = [args.ownerUserId, args.introducerUserId].sort();
  const userMin = a as string;
  const userMax = b as string;
  // VIEWING threads are tied to exactly one ViewingRequest. We always create
  // a fresh one — direct threads use a different kind so the unique
  // constraint won't collide.
  const created = await tx.chatThread.create({
    data: {
      kind: "VIEWING",
      participantAUserId: args.ownerUserId,
      participantBUserId: args.introducerUserId,
      userMin,
      userMax,
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// Public service surface
// ---------------------------------------------------------------------------

export async function createViewingRequest(
  caller: Caller,
  input: viewingRequestSchemas.ViewingRequestCreate,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  // Resolve the property + its current owner snapshot — this is the listing
  // agent at the time of request, persisted on the row so a later transfer
  // doesn't reroute pending requests.
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, deletedAt: null },
    select: {
      id: true,
      ownerUserId: true,
      ownerAgencyId: true,
      visibility: true,
      status: true,
    },
  });
  if (!property) throw new NotFoundError("Property not found.");
  if (property.ownerUserId === caller.userId) {
    throw new ForbiddenError("Cannot request a viewing on your own listing.");
  }
  // SHARED + PUBLIC listings are visible to other agents; PRIVATE is hidden.
  if (property.visibility === "PRIVATE") {
    throw new ForbiddenError("This listing is not open to viewing requests.");
  }
  if (property.status !== "ACTIVE") {
    throw new ForbiddenError("Listing is not currently active.");
  }

  // expiresAt = now + agency.viewingResponseDays (default 3)
  const settings = await prisma.agencySettings.findUnique({
    where: { agencyId: property.ownerAgencyId },
    select: { viewingResponseDays: true },
  });
  const expiresAt = new Date(Date.now() + (settings?.viewingResponseDays ?? 3) * 24 * 3600 * 1000);

  const enc = encryptClient(input.client, hexKey);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.viewingRequest.create({
      data: {
        propertyId: input.propertyId,
        ownerUserId: property.ownerUserId,
        introducerUserId: caller.userId,
        introducerAgencyId: caller.agencyId,
        ...enc,
        preferredDates: input.preferredDates as unknown as Prisma.InputJsonValue,
        durationMinutes: input.durationMinutes ?? null,
        meetingPoint: input.meetingPoint ?? null,
        status: "PENDING",
        expiresAt,
      },
      include: REQUEST_INCLUDE,
    });
    await createNotification(tx, {
      userId: property.ownerUserId,
      kind: "VIEWING_REQUESTED",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: {
        propertyId: row.propertyId,
        introducerUserId: caller.userId,
        introducerMessage: input.introducerMessage ?? null,
      },
    });
    await emitWebhookEvent(tx, {
      type: "VIEWING_REQUESTED",
      agencyId: property.ownerAgencyId,
      payload: {
        viewingRequestId: row.id,
        propertyId: row.propertyId,
        introducerUserId: caller.userId,
        ownerUserId: property.ownerUserId,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return row;
  });

  return toResponse(created, caller, hexKey, storage);
}

export async function listViewingRequests(
  caller: Caller,
  query: viewingRequestSchemas.ViewingRequestListQuery,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequestListResponse> {
  const where: Prisma.ViewingRequestWhereInput = {};
  if (caller.role !== "SUPER_ADMIN") {
    if (query.role === "owner") where.ownerUserId = caller.userId;
    else if (query.role === "introducer") where.introducerUserId = caller.userId;
    else where.OR = [{ ownerUserId: caller.userId }, { introducerUserId: caller.userId }];
  }
  if (query.status) where.status = query.status;

  const orderBy: Prisma.ViewingRequestOrderByWithRelationInput[] = [
    { createdAt: "desc" },
    { id: "desc" },
  ];

  // Page mode — dashboard scope is small enough that OFFSET is fine.
  if (query.page) {
    const pageSize = query.pageSize ?? query.limit;
    const skip = (query.page - 1) * pageSize;
    const [rows, totalCount] = await Promise.all([
      prisma.viewingRequest.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: REQUEST_INCLUDE,
      }),
      prisma.viewingRequest.count({ where }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    return {
      items: rows.map((r) => toResponse(r, caller, hexKey, storage)),
      nextCursor: null,
      totalCount,
      page: query.page,
      pageSize,
      totalPages,
    };
  }

  const cursor = decodeCursor(query.cursor);
  const cursorClause: Prisma.ViewingRequestWhereInput | null = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : null;

  const rows = await prisma.viewingRequest.findMany({
    where: cursorClause ? { AND: [where, cursorClause] } : where,
    orderBy,
    take: query.limit + 1,
    include: REQUEST_INCLUDE,
  });

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor =
    hasMore && tail ? encodeCursor({ createdAt: tail.createdAt.toISOString(), id: tail.id }) : null;

  return {
    items: slice.map((r) => toResponse(r, caller, hexKey, storage)),
    nextCursor,
    totalCount: null,
    page: null,
    pageSize: null,
    totalPages: null,
  };
}

export async function getViewingRequest(
  caller: Caller,
  id: string,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await prisma.viewingRequest.findUnique({
    where: { id },
    include: REQUEST_INCLUDE,
  });
  if (!row) throw new NotFoundError("Viewing request not found.");
  if (!canAccess(caller, row)) throw new ForbiddenError("Not authorised to view this request.");
  return toResponse(row, caller, hexKey, storage);
}

async function loadAndAssertParty(caller: Caller, id: string): Promise<RawRequest> {
  const row = await prisma.viewingRequest.findUnique({
    where: { id },
    include: REQUEST_INCLUDE,
  });
  if (!row) throw new NotFoundError("Viewing request not found.");
  if (!canAccess(caller, row)) throw new ForbiddenError("Not authorised to act on this request.");
  return row;
}

export async function acceptViewingRequest(
  caller: Caller,
  id: string,
  input: viewingRequestSchemas.ViewingRequestAccept,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await loadAndAssertParty(caller, id);
  if (caller.userId !== row.ownerUserId && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only the listing agent can accept.");
  }
  if (row.status !== "PENDING" && row.status !== "RESCHEDULED") {
    throw new InvalidStateError(row.status, "accepted");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Auto-create the VIEWING chat thread on first accept (idempotent on retry).
    const chatThreadId =
      row.chatThreadId ??
      (await getOrCreateViewingThread(tx, {
        ownerUserId: row.ownerUserId,
        introducerUserId: row.introducerUserId,
      }));

    const next = await tx.viewingRequest.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes ?? row.durationMinutes,
        meetingPoint: input.meetingPoint ?? row.meetingPoint,
        chatThreadId,
      },
      include: REQUEST_INCLUDE,
    });

    if (input.responseMessage) {
      await tx.chatMessage.create({
        data: {
          threadId: chatThreadId,
          senderUserId: caller.userId,
          body: input.responseMessage,
          systemKind: "viewing_proposed",
          systemPayload: {
            scheduledAt: input.scheduledAt,
            meetingPoint: input.meetingPoint ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.chatThread.update({
        where: { id: chatThreadId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: input.responseMessage.slice(0, 200),
        },
      });
    }

    await createNotification(tx, {
      userId: row.introducerUserId,
      kind: "VIEWING_ACCEPTED",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: { scheduledAt: input.scheduledAt, meetingPoint: input.meetingPoint ?? null },
    });
    if (next.property.ownerAgencyId) {
      await emitWebhookEvent(tx, {
        type: "VIEWING_ACCEPTED",
        agencyId: next.property.ownerAgencyId,
        payload: {
          viewingRequestId: row.id,
          propertyId: row.propertyId,
          scheduledAt: input.scheduledAt,
          meetingPoint: input.meetingPoint ?? null,
        },
      });
    }
    return next;
  });

  return toResponse(updated, caller, hexKey, storage);
}

export async function declineViewingRequest(
  caller: Caller,
  id: string,
  input: viewingRequestSchemas.ViewingRequestDecline,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await loadAndAssertParty(caller, id);
  if (caller.userId !== row.ownerUserId && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only the listing agent can decline.");
  }
  if (row.status !== "PENDING" && row.status !== "RESCHEDULED") {
    throw new InvalidStateError(row.status, "declined");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.viewingRequest.update({
      where: { id },
      data: { status: "DECLINED" },
      include: REQUEST_INCLUDE,
    });
    await createNotification(tx, {
      userId: row.introducerUserId,
      kind: "VIEWING_DECLINED",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: { reason: input.responseMessage ?? null },
    });
    if (next.property.ownerAgencyId) {
      await emitWebhookEvent(tx, {
        type: "VIEWING_DECLINED",
        agencyId: next.property.ownerAgencyId,
        payload: {
          viewingRequestId: row.id,
          propertyId: row.propertyId,
          reason: input.responseMessage ?? null,
        },
      });
    }
    return next;
  });
  return toResponse(updated, caller, hexKey, storage);
}

export async function rescheduleViewingRequest(
  caller: Caller,
  id: string,
  input: viewingRequestSchemas.ViewingRequestReschedule,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await loadAndAssertParty(caller, id);
  if (row.status !== "PENDING" && row.status !== "ACCEPTED" && row.status !== "RESCHEDULED") {
    throw new InvalidStateError(row.status, "rescheduled");
  }

  // The other party becomes the recipient of the notification — whoever did
  // not initiate the reschedule needs to confirm by accepting again.
  const otherUserId = caller.userId === row.ownerUserId ? row.introducerUserId : row.ownerUserId;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.viewingRequest.update({
      where: { id },
      data: {
        status: "RESCHEDULED",
        scheduledAt: new Date(input.scheduledAt),
        meetingPoint: input.meetingPoint ?? row.meetingPoint,
      },
      include: REQUEST_INCLUDE,
    });
    if (row.chatThreadId && input.responseMessage) {
      await tx.chatMessage.create({
        data: {
          threadId: row.chatThreadId,
          senderUserId: caller.userId,
          body: input.responseMessage,
          systemKind: "viewing_proposed",
          systemPayload: {
            scheduledAt: input.scheduledAt,
            meetingPoint: input.meetingPoint ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.chatThread.update({
        where: { id: row.chatThreadId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: input.responseMessage.slice(0, 200),
        },
      });
    }
    await createNotification(tx, {
      userId: otherUserId,
      kind: "VIEWING_RESCHEDULED",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: { scheduledAt: input.scheduledAt, meetingPoint: input.meetingPoint ?? null },
    });
    return next;
  });
  return toResponse(updated, caller, hexKey, storage);
}

export async function cancelViewingRequest(
  caller: Caller,
  id: string,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await loadAndAssertParty(caller, id);
  if (row.status !== "PENDING" && row.status !== "ACCEPTED" && row.status !== "RESCHEDULED") {
    throw new InvalidStateError(row.status, "cancelled");
  }
  const otherUserId = caller.userId === row.ownerUserId ? row.introducerUserId : row.ownerUserId;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.viewingRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: REQUEST_INCLUDE,
    });
    await createNotification(tx, {
      userId: otherUserId,
      kind: "VIEWING_CANCELLED",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: { cancelledBy: caller.userId },
    });
    return next;
  });
  return toResponse(updated, caller, hexKey, storage);
}

export async function setViewingOutcome(
  caller: Caller,
  id: string,
  input: viewingRequestSchemas.ViewingRequestOutcome,
  hexKey: string,
  storage: Storage,
): Promise<viewingRequestSchemas.ViewingRequest> {
  const row = await loadAndAssertParty(caller, id);
  if (caller.userId !== row.ownerUserId && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only the listing agent records the outcome.");
  }
  if (row.status !== "ACCEPTED") {
    throw new InvalidStateError(row.status, "given an outcome");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.viewingRequest.update({
      where: { id },
      data: {
        outcome: input.outcome,
        status: "COMPLETED",
      },
      include: REQUEST_INCLUDE,
    });
    if (row.chatThreadId && input.notes) {
      await tx.chatMessage.create({
        data: {
          threadId: row.chatThreadId,
          senderUserId: caller.userId,
          body: input.notes,
          systemKind: null,
        },
      });
      await tx.chatThread.update({
        where: { id: row.chatThreadId },
        data: { lastMessageAt: new Date(), lastMessagePreview: input.notes.slice(0, 200) },
      });
    }
    await createNotification(tx, {
      userId: row.introducerUserId,
      kind: "VIEWING_OUTCOME_SET",
      targetKind: "ViewingRequest",
      targetId: row.id,
      payload: { outcome: input.outcome },
    });
    if (next.property.ownerAgencyId) {
      await emitWebhookEvent(tx, {
        type: "VIEWING_COMPLETED",
        agencyId: next.property.ownerAgencyId,
        payload: {
          viewingRequestId: row.id,
          propertyId: row.propertyId,
          outcome: input.outcome,
        },
      });
    }
    return next;
  });
  return toResponse(updated, caller, hexKey, storage);
}

/**
 * Worker-driven sweep: PENDING + expiresAt < now → EXPIRED with one
 * notification per side. Returns the count of rows transitioned.
 */
export async function expireStaleViewingRequests(): Promise<number> {
  const stale = await prisma.viewingRequest.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true, ownerUserId: true, introducerUserId: true },
    take: 200,
  });
  if (stale.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.viewingRequest.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "EXPIRED" },
    });
    const notes = stale.flatMap((s) => [
      {
        userId: s.ownerUserId,
        kind: "VIEWING_EXPIRING_SOON" as const,
        targetKind: "ViewingRequest",
        targetId: s.id,
      },
      {
        userId: s.introducerUserId,
        kind: "VIEWING_EXPIRING_SOON" as const,
        targetKind: "ViewingRequest",
        targetId: s.id,
      },
    ]);
    if (notes.length > 0) {
      await tx.notification.createMany({
        data: notes.map((n) => ({
          userId: n.userId,
          kind: n.kind,
          targetKind: n.targetKind,
          targetId: n.targetId,
        })),
      });
    }
  });
  return stale.length;
}
