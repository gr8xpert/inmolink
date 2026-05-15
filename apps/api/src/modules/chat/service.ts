import { prisma } from "@inmolink/db";
import type { chatSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { AppIOServer } from "../../realtime/io";
import { createNotification } from "../notifications/service";

/**
 * Chat service (PLAN §11.6).
 *
 * Threads come in two flavours:
 *  - VIEWING: created by the ViewingRequest accept flow; one thread per
 *    request; uniqueness via FK + chatThreadId on ViewingRequest.
 *  - DIRECT: free-form 1:1; uniqueness enforced via @@unique(kind, userMin, userMax).
 *
 * All writes go through this service. Once persisted we fanout via Socket.io
 * to `thread:<id>` (subscribed by both participants' open clients) and emit
 * a notification row for offline delivery via the email-digest worker.
 */

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CHAT_NOT_FOUND";
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "CHAT_FORBIDDEN";
}

export class InvalidArgError extends Error {
  readonly statusCode = 400;
  readonly code = "CHAT_INVALID_ARG";
}

export type Caller = {
  userId: string;
  agencyId: string | null;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
};

const PARTICIPANT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  slug: true,
  agencyId: true,
} as const satisfies Prisma.UserSelect;

function decodeCreatedAtCursor(c: string | undefined): { createdAt: string; id: string } | null {
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

function encodeCreatedAtCursor(args: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(args)).toString("base64url");
}

function isParticipant(
  caller: Caller,
  row: { participantAUserId: string; participantBUserId: string },
): boolean {
  return caller.userId === row.participantAUserId || caller.userId === row.participantBUserId;
}

function counterpartyOf(
  caller: Caller,
  row: {
    participantAUserId: string;
    participantBUserId: string;
    participantA: {
      id: string;
      firstName: string;
      lastName: string;
      slug: string;
      agencyId: string | null;
    };
    participantB: {
      id: string;
      firstName: string;
      lastName: string;
      slug: string;
      agencyId: string | null;
    };
  },
) {
  return caller.userId === row.participantAUserId ? row.participantB : row.participantA;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function listThreads(
  caller: Caller,
  query: chatSchemas.ChatThreadListQuery,
): Promise<chatSchemas.ChatThreadListResponse> {
  const where: Prisma.ChatThreadWhereInput = {
    OR: [{ participantAUserId: caller.userId }, { participantBUserId: caller.userId }],
  };
  if (query.kind) where.kind = query.kind;

  const cursor = (() => {
    if (!query.cursor) return null;
    try {
      return JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as {
        lastMessageAt: string | null;
        id: string;
      };
    } catch {
      return null;
    }
  })();
  // Threads with no messages yet sort to the bottom; createdAt acts as
  // tiebreaker. We use lastMessageAt-then-id descending.
  const cursorClause: Prisma.ChatThreadWhereInput | null = cursor
    ? {
        OR: [
          {
            lastMessageAt: cursor.lastMessageAt ? { lt: new Date(cursor.lastMessageAt) } : null,
          },
          {
            lastMessageAt: cursor.lastMessageAt ? new Date(cursor.lastMessageAt) : null,
            id: { lt: cursor.id },
          },
        ],
      }
    : null;

  const rows = await prisma.chatThread.findMany({
    where: cursorClause ? { AND: [where, cursorClause] } : where,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: query.limit + 1,
    include: {
      participantA: { select: PARTICIPANT_SELECT },
      participantB: { select: PARTICIPANT_SELECT },
      reads: { where: { userId: caller.userId }, select: { lastReadAt: true } },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  // Compute unread per thread: messages created after the caller's
  // ChatThreadRead.lastReadAt (or all messages if no read row).
  const slice = rows.slice(0, query.limit);
  const unreadCounts = await Promise.all(
    slice.map(async (t) => {
      const lastReadAt = t.reads[0]?.lastReadAt ?? null;
      const innerWhere: Prisma.ChatMessageWhereInput = {
        threadId: t.id,
        senderUserId: { not: caller.userId },
      };
      if (lastReadAt) innerWhere.createdAt = { gt: lastReadAt };
      return prisma.chatMessage.count({ where: innerWhere });
    }),
  );

  const tail = slice[slice.length - 1];
  const nextCursor =
    rows.length > query.limit && tail
      ? Buffer.from(
          JSON.stringify({
            lastMessageAt: tail.lastMessageAt?.toISOString() ?? null,
            id: tail.id,
          }),
        ).toString("base64url")
      : null;

  return {
    items: slice.map((t, i) => ({
      id: t.id,
      kind: t.kind,
      counterparty: counterpartyOf(caller, t),
      viewingRequestId: null,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: t.lastMessagePreview,
      unreadCount: unreadCounts[i] ?? 0,
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function getOrCreateDirectThread(
  caller: Caller,
  input: chatSchemas.DirectThreadCreate,
): Promise<chatSchemas.ChatThread> {
  if (input.otherUserId === caller.userId) {
    throw new InvalidArgError("Cannot start a direct chat with yourself.");
  }
  const other = await prisma.user.findUnique({
    where: { id: input.otherUserId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      slug: true,
      agencyId: true,
      isActive: true,
    },
  });
  if (!other || !other.isActive) throw new NotFoundError("Recipient not found.");

  const [a, b] = [caller.userId, other.id].sort();
  const userMin = a as string;
  const userMax = b as string;

  // Direct-thread uniqueness is now a PARTIAL unique index (WHERE kind = 'DIRECT')
  // — Prisma can't model partial unique as a `findUnique` / `upsert` key, so we
  // do the get-or-create dance manually: findFirst, then create, then catch the
  // P2002 race by re-reading.
  const include = {
    participantA: { select: PARTICIPANT_SELECT },
    participantB: { select: PARTICIPANT_SELECT },
  } as const;
  let thread = await prisma.chatThread.findFirst({
    where: { kind: "DIRECT", userMin, userMax },
    include,
  });
  if (!thread) {
    try {
      thread = await prisma.chatThread.create({
        data: {
          kind: "DIRECT",
          participantAUserId: caller.userId,
          participantBUserId: other.id,
          userMin,
          userMax,
        },
        include,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err;
      const found = await prisma.chatThread.findFirst({
        where: { kind: "DIRECT", userMin, userMax },
        include,
      });
      if (!found) throw err;
      thread = found;
    }
  }
  return {
    id: thread.id,
    kind: thread.kind,
    counterparty: counterpartyOf(caller, thread),
    viewingRequestId: null,
    lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: thread.lastMessagePreview,
    unreadCount: 0,
    createdAt: thread.createdAt.toISOString(),
  };
}

async function loadThreadOrThrow(caller: Caller, threadId: string) {
  const t = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      participantA: { select: PARTICIPANT_SELECT },
      participantB: { select: PARTICIPANT_SELECT },
      viewingRequest: { select: { id: true } },
    },
  });
  if (!t) throw new NotFoundError("Thread not found.");
  if (!isParticipant(caller, t) && caller.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Not authorised on this thread.");
  }
  return t;
}

export async function getThread(caller: Caller, threadId: string): Promise<chatSchemas.ChatThread> {
  const t = await loadThreadOrThrow(caller, threadId);
  const lastReadAt =
    (
      await prisma.chatThreadRead.findUnique({
        where: { threadId_userId: { threadId, userId: caller.userId } },
        select: { lastReadAt: true },
      })
    )?.lastReadAt ?? null;
  const unreadWhere: Prisma.ChatMessageWhereInput = {
    threadId,
    senderUserId: { not: caller.userId },
  };
  if (lastReadAt) unreadWhere.createdAt = { gt: lastReadAt };
  const unreadCount = await prisma.chatMessage.count({ where: unreadWhere });
  return {
    id: t.id,
    kind: t.kind,
    counterparty: counterpartyOf(caller, t),
    viewingRequestId: t.viewingRequest?.id ?? null,
    lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: t.lastMessagePreview,
    unreadCount,
    createdAt: t.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function listMessages(
  caller: Caller,
  threadId: string,
  query: { cursor?: string; limit: number },
): Promise<chatSchemas.ChatMessageListResponse> {
  await loadThreadOrThrow(caller, threadId);

  const cursor = decodeCreatedAtCursor(query.cursor);
  const where: Prisma.ChatMessageWhereInput = { threadId };
  if (cursor) {
    where.OR = [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
    ];
  }

  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor =
    hasMore && tail
      ? encodeCreatedAtCursor({ createdAt: tail.createdAt.toISOString(), id: tail.id })
      : null;
  return {
    items: slice.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      senderUserId: m.senderUserId,
      body: m.body,
      attachments: m.attachments,
      systemKind: m.systemKind,
      systemPayload: m.systemPayload,
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function postMessage(
  caller: Caller,
  threadId: string,
  input: chatSchemas.ChatMessageCreate,
  io: AppIOServer | null,
): Promise<chatSchemas.ChatMessage> {
  const thread = await loadThreadOrThrow(caller, threadId);
  if (caller.role === "SUPER_ADMIN" && !isParticipant(caller, thread)) {
    throw new ForbiddenError("Super-admin cannot post in threads they are not part of.");
  }
  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.chatMessage.create({
      data: {
        threadId,
        senderUserId: caller.userId,
        body: input.body,
        attachments: (input.attachments ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.chatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: m.createdAt, lastMessagePreview: input.body.slice(0, 200) },
    });
    // Auto-mark sender's read pointer at their own message — sender shouldn't
    // see their own messages as "unread".
    await tx.chatThreadRead.upsert({
      where: { threadId_userId: { threadId, userId: caller.userId } },
      create: {
        threadId,
        userId: caller.userId,
        lastReadAt: m.createdAt,
        lastReadMessageId: m.id,
      },
      update: { lastReadAt: m.createdAt, lastReadMessageId: m.id },
    });
    // Notify the other participant — drives the bell badge + email digest.
    const otherUserId =
      caller.userId === thread.participantAUserId
        ? thread.participantBUserId
        : thread.participantAUserId;
    await createNotification(tx, {
      userId: otherUserId,
      kind: "CHAT_MESSAGE",
      targetKind: "ChatThread",
      targetId: threadId,
      payload: { messageId: m.id, preview: input.body.slice(0, 200) },
    });
    return m;
  });

  const wirePayload: chatSchemas.ChatMessage = {
    id: created.id,
    threadId: created.threadId,
    senderUserId: created.senderUserId,
    body: created.body,
    attachments: created.attachments,
    systemKind: created.systemKind,
    systemPayload: created.systemPayload,
    editedAt: created.editedAt?.toISOString() ?? null,
    deletedAt: created.deletedAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  };

  if (io) {
    io.to(`thread:${threadId}`).emit("chat:message:new", wirePayload);
    // Per-user fanout for the unread-count badge — even if the recipient
    // isn't subscribed to this thread room (e.g. they're on /dashboard
    // not /chat).
    const otherUserId =
      caller.userId === thread.participantAUserId
        ? thread.participantBUserId
        : thread.participantAUserId;
    io.to(`user:${otherUserId}`).emit("notification:new", {
      kind: "CHAT_MESSAGE",
      threadId,
      messageId: created.id,
    });
  }

  return wirePayload;
}

export async function markRead(
  caller: Caller,
  threadId: string,
  input: chatSchemas.ChatMarkRead,
): Promise<{ ok: true; lastReadAt: string }> {
  await loadThreadOrThrow(caller, threadId);
  const target = input.lastReadMessageId
    ? await prisma.chatMessage.findFirst({
        where: { id: input.lastReadMessageId, threadId },
        select: { id: true, createdAt: true },
      })
    : await prisma.chatMessage.findFirst({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
  const now = new Date();
  const at = target?.createdAt ?? now;
  await prisma.chatThreadRead.upsert({
    where: { threadId_userId: { threadId, userId: caller.userId } },
    create: {
      threadId,
      userId: caller.userId,
      lastReadAt: at,
      lastReadMessageId: target?.id,
    },
    update: { lastReadAt: at, lastReadMessageId: target?.id ?? null },
  });
  return { ok: true, lastReadAt: at.toISOString() };
}
