import { prisma } from "@inmolink/db";
import type { ticketSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "Not allowed") {
    super(message);
  }
}
export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Not found") {
    super(message);
  }
}

/**
 * Visibility:
 *   SUPER_ADMIN — all tickets
 *   AGENCY_ADMIN — tickets opened by anyone in their agency
 *   AGENT — only own
 */
function ticketVisibilityWhere(user: AuthenticatedUser): Prisma.TicketWhereInput {
  if (user.role === "SUPER_ADMIN") return {};
  if (user.role === "AGENCY_ADMIN") {
    if (!user.agencyId) return { id: "__none__" };
    return { OR: [{ agencyId: user.agencyId }, { openedById: user.id }] };
  }
  return { openedById: user.id };
}

function callerActions(
  user: AuthenticatedUser,
  ticket: { openedById: string; agencyId: string | null; status: string },
) {
  const isOwner = ticket.openedById === user.id;
  const isAgencyAdmin = user.role === "AGENCY_ADMIN" && user.agencyId === ticket.agencyId;
  const isSuper = user.role === "SUPER_ADMIN";
  const open = ticket.status !== "CLOSED";
  return {
    canReply: open && (isOwner || isAgencyAdmin || isSuper),
    canAssign: isSuper,
    canChangeStatus: isSuper,
    canSeeInternal: isSuper,
  };
}

function decodeCursor(cursor: string | undefined): { lastActivityAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function encodeCursor(c: { lastActivityAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ lastActivityAt: c.lastActivityAt.toISOString(), id: c.id }),
  ).toString("base64url");
}

export async function listTickets(
  user: AuthenticatedUser,
  query: {
    cursor?: string;
    limit?: number;
    status?: ticketSchemas.TicketStatus;
    priority?: ticketSchemas.TicketPriority;
    category?: ticketSchemas.TicketCategory;
    assignedToId?: string;
    agencyId?: string;
    q?: string;
  },
) {
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const where: Prisma.TicketWhereInput = ticketVisibilityWhere(user);
  if (query.status) where.status = query.status as Prisma.TicketWhereInput["status"];
  if (query.priority) where.priority = query.priority as Prisma.TicketWhereInput["priority"];
  if (query.category) where.category = query.category as Prisma.TicketWhereInput["category"];
  if (query.q) where.subject = { contains: query.q, mode: "insensitive" };
  if (user.role === "SUPER_ADMIN") {
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.agencyId) where.agencyId = query.agencyId;
  }
  const decoded = decodeCursor(query.cursor);
  if (decoded) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { lastActivityAt: { lt: new Date(decoded.lastActivityAt) } },
          { lastActivityAt: new Date(decoded.lastActivityAt), id: { lt: decoded.id } },
        ],
      },
    ];
  }
  const rows = await prisma.ticket.findMany({
    where,
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      openedBy: {
        select: { firstName: true, lastName: true, agency: { select: { id: true, name: true } } },
      },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { messages: true } },
    },
  });
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  return {
    items: slice.map((r) => ({
      id: r.id,
      number: r.number,
      subject: r.subject,
      category: r.category as ticketSchemas.TicketCategory,
      priority: r.priority as ticketSchemas.TicketPriority,
      status: r.status as ticketSchemas.TicketStatus,
      openedById: r.openedById,
      agencyId: r.agencyId,
      agencyName: r.openedBy.agency?.name ?? null,
      assignedToId: r.assignedToId,
      assignedToName: r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : null,
      openedByName: `${r.openedBy.firstName} ${r.openedBy.lastName}`,
      lastActivityAt: r.lastActivityAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      messageCount: r._count.messages,
    })),
    nextCursor:
      hasMore && tail ? encodeCursor({ lastActivityAt: tail.lastActivityAt, id: tail.id }) : null,
  };
}

async function loadTicketForAccess(
  user: AuthenticatedUser,
  id: string,
): Promise<{ ticket: Prisma.TicketGetPayload<typeof TICKET_DETAIL_INCLUDE> }> {
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...ticketVisibilityWhere(user) },
    ...TICKET_DETAIL_INCLUDE,
  });
  if (!ticket) throw new NotFoundError("Ticket not found");
  return { ticket };
}

const TICKET_DETAIL_INCLUDE = Prisma.validator<Prisma.TicketDefaultArgs>()({
  include: {
    openedBy: {
      select: {
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        agency: { select: { id: true, name: true } },
      },
    },
    assignedTo: { select: { firstName: true, lastName: true } },
    messages: {
      orderBy: [{ createdAt: "asc" }],
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    },
  },
});

export async function getTicket(
  user: AuthenticatedUser,
  id: string,
  storage: Storage,
): Promise<ticketSchemas.TicketDetail> {
  const { ticket } = await loadTicketForAccess(user, id);
  const actions = callerActions(user, ticket);
  // Hide internal notes from non-super-admin even if they could otherwise
  // see the ticket via agencyId membership.
  const messages = (
    actions.canSeeInternal ? ticket.messages : ticket.messages.filter((m) => !m.isInternal)
  ).map((m) => ({
    id: m.id,
    authorId: m.authorId,
    author: {
      id: m.author.id,
      firstName: m.author.firstName,
      lastName: m.author.lastName,
      email: m.author.email,
      role: m.author.role,
    },
    body: m.body,
    attachments: hydrateAttachments(m.attachments, storage),
    isInternal: m.isInternal,
    createdAt: m.createdAt.toISOString(),
  }));
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    category: ticket.category as ticketSchemas.TicketCategory,
    priority: ticket.priority as ticketSchemas.TicketPriority,
    status: ticket.status as ticketSchemas.TicketStatus,
    openedById: ticket.openedById,
    agencyId: ticket.agencyId,
    agencyName: ticket.openedBy.agency?.name ?? null,
    assignedToId: ticket.assignedToId,
    assignedToName: ticket.assignedTo
      ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
      : null,
    openedByName: `${ticket.openedBy.firstName} ${ticket.openedBy.lastName}`,
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
    messageCount: ticket.messages.length,
    messages,
    callerActions: actions,
  };
}

function hydrateAttachments(
  raw: Prisma.JsonValue,
  storage: Storage,
): ticketSchemas.TicketAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ticketSchemas.TicketAttachment[] = [];
  for (const a of raw as Array<Record<string, unknown>>) {
    if (!a || typeof a !== "object") continue;
    const mediaObjectId = String(a.mediaObjectId ?? "");
    const name = String(a.name ?? "");
    const size = Number(a.size ?? 0);
    const mimeType = String(a.mimeType ?? "application/octet-stream");
    const r2Key = String(a.r2Key ?? "");
    if (!mediaObjectId || !name || !r2Key) continue;
    out.push({ mediaObjectId, name, size, mimeType, url: storage.publicUrl(r2Key) });
  }
  return out;
}

/**
 * Resolve attachment input (mediaObjectIds + names) into the JSON shape we
 * persist on TicketMessage.attachments. Bumps `MediaObject.refCount` for
 * each attached object inside the same transaction so the cleanup worker
 * doesn't reap them.
 */
async function resolveAttachments(
  tx: Prisma.TransactionClient,
  attachments: ticketSchemas.TicketAttachment[],
): Promise<Array<Record<string, unknown>>> {
  if (attachments.length === 0) return [];
  const ids = attachments.map((a) => a.mediaObjectId);
  const objs = await tx.mediaObject.findMany({
    where: { id: { in: ids } },
    select: { id: true, r2Key: true, mimeType: true, bytes: true },
  });
  const byId = new Map(objs.map((o) => [o.id, o]));
  const resolved: Array<Record<string, unknown>> = [];
  for (const a of attachments) {
    const m = byId.get(a.mediaObjectId);
    if (!m) {
      throw new NotFoundError(`Attachment ${a.mediaObjectId} not found`);
    }
    await tx.mediaObject.update({
      where: { id: m.id },
      data: { refCount: { increment: 1 }, scheduledDeleteAt: null },
    });
    resolved.push({
      mediaObjectId: m.id,
      name: a.name,
      size: m.bytes,
      mimeType: m.mimeType,
      r2Key: m.r2Key,
    });
  }
  return resolved;
}

export async function createTicket(
  user: AuthenticatedUser,
  input: ticketSchemas.TicketCreateInput,
  storage: Storage,
): Promise<ticketSchemas.TicketDetail> {
  const created = await prisma.$transaction(async (tx) => {
    const attachments = await resolveAttachments(tx, input.attachments ?? []);
    return tx.ticket.create({
      data: {
        openedById: user.id,
        agencyId: user.agencyId,
        category: input.category,
        priority: input.priority,
        status: "OPEN",
        subject: input.subject,
        lastActivityAt: new Date(),
        messages: {
          create: {
            authorId: user.id,
            body: input.body,
            attachments: attachments as Prisma.InputJsonValue,
            isInternal: false,
          },
        },
      },
      select: { id: true },
    });
  });
  return getTicket(user, created.id, storage);
}

export async function replyTicket(
  user: AuthenticatedUser,
  id: string,
  input: ticketSchemas.TicketReplyInput,
  storage: Storage,
): Promise<ticketSchemas.TicketDetail> {
  const { ticket } = await loadTicketForAccess(user, id);
  if (ticket.status === "CLOSED") {
    throw new ForbiddenError("Ticket is closed");
  }
  const isInternal = input.isInternal && user.role === "SUPER_ADMIN";
  await prisma.$transaction(async (tx) => {
    const attachments = await resolveAttachments(tx, input.attachments ?? []);
    await tx.ticketMessage.create({
      data: {
        ticketId: id,
        authorId: user.id,
        body: input.body,
        attachments: attachments as Prisma.InputJsonValue,
        isInternal,
      },
    });
    await tx.ticket.update({
      where: { id },
      data: {
        lastActivityAt: new Date(),
        // Reopen + auto-promote to IN_PROGRESS only when a non-customer
        // (super-admin) replies. A customer replying to a RESOLVED ticket
        // bumps it back to IN_PROGRESS so super-admin sees it again.
        ...(ticket.status === "RESOLVED" && !isInternal ? { status: "IN_PROGRESS" } : {}),
        ...(ticket.status === "OPEN" && user.role === "SUPER_ADMIN"
          ? { status: "IN_PROGRESS" }
          : {}),
      },
    });
  });
  return getTicket(user, id, storage);
}

export async function assignTicket(
  user: AuthenticatedUser,
  id: string,
  assignedToId: string | null,
  storage: Storage,
): Promise<ticketSchemas.TicketDetail> {
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  await loadTicketForAccess(user, id);
  if (assignedToId) {
    const target = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError("Assignee not found");
    if (target.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("Can only assign tickets to super-admins");
    }
  }
  await prisma.ticket.update({
    where: { id },
    data: { assignedToId, lastActivityAt: new Date() },
  });
  return getTicket(user, id, storage);
}

export async function changeTicketStatus(
  user: AuthenticatedUser,
  id: string,
  status: ticketSchemas.TicketStatus,
  storage: Storage,
): Promise<ticketSchemas.TicketDetail> {
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  await loadTicketForAccess(user, id);
  const now = new Date();
  await prisma.ticket.update({
    where: { id },
    data: {
      status,
      lastActivityAt: now,
      resolvedAt: status === "RESOLVED" ? now : undefined,
      closedAt: status === "CLOSED" ? now : undefined,
    },
  });
  return getTicket(user, id, storage);
}
