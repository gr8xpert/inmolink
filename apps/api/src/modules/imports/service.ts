import { encryptToString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { feedConnectionSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FeedConnectorKind, Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import {
  enqueueFeedImportNow,
  removeFeedImportSchedule,
  upsertFeedImportSchedule,
} from "../../lib/queues";

/**
 * FeedConnection CRUD + manual-run (PLAN §11.5). Owner-scoped — agents
 * manage their own feeds; AGENCY_ADMIN can manage any feed in their
 * agency. Credentials are AES-encrypted at rest with the same key the
 * worker decrypts with (env.ENCRYPTION_KEY).
 */

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}

type Caller = {
  userId: string;
  agencyId: string | null;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
};

type RawConnection = {
  id: string;
  ownerUserId: string;
  agencyId: string | null;
  kind: FeedConnectorKind;
  feedUrl: string;
  uploadedFileKey: string | null;
  credentialsEnc: string | null;
  fieldMappings: Prisma.JsonValue;
  syncEnabled: boolean;
  cronSchedule: string;
  isLocked: boolean;
  lockedAt: Date | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toResponse(c: RawConnection): feedConnectionSchemas.FeedConnection {
  return {
    id: c.id,
    ownerUserId: c.ownerUserId,
    agencyId: c.agencyId,
    kind: c.kind,
    feedUrl: c.feedUrl,
    hasCredentials: c.credentialsEnc !== null,
    fieldMappings:
      c.fieldMappings as unknown as feedConnectionSchemas.FeedConnection["fieldMappings"],
    syncEnabled: c.syncEnabled,
    cronSchedule: c.cronSchedule,
    isLocked: c.isLocked,
    lockedAt: c.lockedAt?.toISOString() ?? null,
    lastRunAt: c.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
    lastError: c.lastError,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function visibilityFilter(caller: Caller): Prisma.FeedConnectionWhereInput {
  if (caller.role === "SUPER_ADMIN") return {};
  if (caller.role === "AGENCY_ADMIN") {
    return {
      OR: [
        { ownerUserId: caller.userId },
        { agencyId: caller.agencyId ?? undefined },
        { owner: { is: { agencyId: caller.agencyId ?? undefined } } },
      ],
    };
  }
  return { ownerUserId: caller.userId };
}

async function assertCanWrite(
  caller: Caller,
  connection: { ownerUserId: string; agencyId: string | null; owner?: { agencyId: string | null } },
): Promise<void> {
  if (caller.role === "SUPER_ADMIN") return;
  if (caller.userId === connection.ownerUserId) return;
  if (caller.role === "AGENCY_ADMIN") {
    const ownerAgencyId = connection.agencyId ?? connection.owner?.agencyId ?? null;
    if (ownerAgencyId && ownerAgencyId === caller.agencyId) return;
  }
  throw new ForbiddenError("Cannot manage this feed connection");
}

function encryptCredentials(
  creds: Record<string, string> | null | undefined,
  hexKey: string,
): string | null {
  if (!creds || Object.keys(creds).length === 0) return null;
  const keyBuf = Buffer.from(hexKey, "hex");
  return encryptToString(JSON.stringify(creds), keyBuf);
}

export async function listFeedConnections(
  caller: Caller,
): Promise<{ items: feedConnectionSchemas.FeedConnection[] }> {
  const rows = await prisma.feedConnection.findMany({
    where: visibilityFilter(caller),
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { items: rows.map(toResponse) };
}

export async function getFeedConnection(
  caller: Caller,
  id: string,
): Promise<feedConnectionSchemas.FeedConnection> {
  const row = await prisma.feedConnection.findFirst({
    where: { id, ...visibilityFilter(caller) },
  });
  if (!row) throw new NotFoundError("FeedConnection not found");
  return toResponse(row);
}

export async function createFeedConnection(
  caller: Caller,
  input: feedConnectionSchemas.FeedConnectionCreate,
  feedImportQueue: Queue,
  encryptionKeyHex: string,
): Promise<feedConnectionSchemas.FeedConnection> {
  const data: Prisma.FeedConnectionCreateInput = {
    owner: { connect: { id: caller.userId } },
    agencyId: caller.agencyId,
    kind: input.kind,
    feedUrl: input.feedUrl,
    credentialsEnc: encryptCredentials(input.credentials, encryptionKeyHex),
    fieldMappings: (input.fieldMappings ?? null) as unknown as Prisma.InputJsonValue,
    syncEnabled: input.syncEnabled,
    cronSchedule: input.cronSchedule,
  };
  const created = await prisma.feedConnection.create({ data });

  if (created.syncEnabled) {
    await upsertFeedImportSchedule(feedImportQueue, {
      connectionId: created.id,
      cronPattern: created.cronSchedule,
    });
  }

  return toResponse(created);
}

export async function updateFeedConnection(
  caller: Caller,
  id: string,
  input: feedConnectionSchemas.FeedConnectionUpdate,
  feedImportQueue: Queue,
  encryptionKeyHex: string,
): Promise<feedConnectionSchemas.FeedConnection> {
  const existing = await prisma.feedConnection.findUnique({
    where: { id },
    include: { owner: { select: { agencyId: true } } },
  });
  if (!existing) throw new NotFoundError();
  await assertCanWrite(caller, existing);

  const data: Prisma.FeedConnectionUpdateInput = {};
  if (input.feedUrl !== undefined) data.feedUrl = input.feedUrl;
  if (input.cronSchedule !== undefined) data.cronSchedule = input.cronSchedule;
  if (input.syncEnabled !== undefined) data.syncEnabled = input.syncEnabled;
  if (input.fieldMappings !== undefined) {
    data.fieldMappings = (input.fieldMappings ?? null) as unknown as Prisma.InputJsonValue;
  }
  if (input.credentials !== undefined) {
    data.credentialsEnc = encryptCredentials(input.credentials, encryptionKeyHex);
  }

  const updated = await prisma.feedConnection.update({ where: { id }, data });

  // Reconcile schedule.
  if (updated.syncEnabled) {
    await upsertFeedImportSchedule(feedImportQueue, {
      connectionId: updated.id,
      cronPattern: updated.cronSchedule,
    });
  } else {
    await removeFeedImportSchedule(feedImportQueue, { connectionId: updated.id });
  }

  return toResponse(updated);
}

export async function deleteFeedConnection(
  caller: Caller,
  id: string,
  feedImportQueue: Queue,
  storage?: Storage,
): Promise<{ ok: true }> {
  const existing = await prisma.feedConnection.findUnique({
    where: { id },
    include: { owner: { select: { agencyId: true } } },
  });
  if (!existing) throw new NotFoundError();
  await assertCanWrite(caller, existing);

  await prisma.feedConnection.delete({ where: { id } });
  await removeFeedImportSchedule(feedImportQueue, { connectionId: id });

  // Manual XML uploads have an associated Storage object — remove it so
  // we don't leave orphan files. Failures are logged but not fatal; the
  // orphan-cleanup worker would catch them on its next sweep.
  if (existing.uploadedFileKey && storage) {
    await storage.delete(existing.uploadedFileKey).catch(() => undefined);
  }
  return { ok: true };
}

export async function triggerManualRun(
  caller: Caller,
  id: string,
  feedImportQueue: Queue,
): Promise<{ runId: string; jobId: string }> {
  const existing = await prisma.feedConnection.findUnique({
    where: { id },
    include: { owner: { select: { agencyId: true } } },
  });
  if (!existing) throw new NotFoundError();
  await assertCanWrite(caller, existing);

  if (existing.isLocked) {
    throw new ForbiddenError("A run is already in progress for this feed");
  }

  const run = await prisma.feedRun.create({
    data: {
      connectionId: id,
      status: "QUEUED",
      triggeredBy: "MANUAL",
      triggeredByUserId: caller.userId,
      startedAt: new Date(),
    },
  });

  const jobId = await enqueueFeedImportNow(feedImportQueue, {
    connectionId: id,
    runId: run.id,
    triggeredBy: "MANUAL",
  });

  return { runId: run.id, jobId };
}

/**
 * One-off manual XML upload (PLAN §11.5 "Manual XML upload supported").
 *
 * The api streams the uploaded file to Storage, creates a transient
 * FeedConnection with `syncEnabled=false` (no cron) + `uploadedFileKey`
 * set, then triggers a manual run. The worker reads from Storage instead
 * of HTTP-fetching feedUrl. The connection sticks around so the user can
 * see the run history; deleting it removes the file from Storage too.
 */
export async function uploadManualXml(
  caller: Caller,
  args: {
    kind: FeedConnectorKind;
    fileBuffer: Buffer;
    filename: string;
    contentType: string;
    fieldMappings: feedConnectionSchemas.FeedConnection["fieldMappings"] | null;
  },
  storage: Storage,
  feedImportQueue: Queue,
): Promise<{ connectionId: string; runId: string; jobId: string }> {
  const ts = Date.now();
  const sanitised = args.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const key = `imports/${caller.userId}/${ts}-${sanitised}`;

  await storage.put(key, args.fileBuffer, args.contentType);

  const connection = await prisma.feedConnection.create({
    data: {
      owner: { connect: { id: caller.userId } },
      agencyId: caller.agencyId,
      kind: args.kind,
      // feedUrl carries a label for the dashboard; the worker uses
      // uploadedFileKey when this column is non-null.
      feedUrl: `upload://${sanitised}`,
      uploadedFileKey: key,
      fieldMappings: (args.fieldMappings ?? null) as unknown as Prisma.InputJsonValue,
      syncEnabled: false,
      cronSchedule: "0 0 * * *", // unused — syncEnabled=false
    },
  });

  const run = await prisma.feedRun.create({
    data: {
      connectionId: connection.id,
      status: "QUEUED",
      triggeredBy: "MANUAL",
      triggeredByUserId: caller.userId,
      startedAt: new Date(),
    },
  });

  const jobId = await enqueueFeedImportNow(feedImportQueue, {
    connectionId: connection.id,
    runId: run.id,
    triggeredBy: "MANUAL",
  });

  return { connectionId: connection.id, runId: run.id, jobId };
}

export async function listRuns(
  caller: Caller,
  connectionId: string,
  limit = 50,
): Promise<{ items: feedConnectionSchemas.FeedRun[] }> {
  const conn = await prisma.feedConnection.findFirst({
    where: { id: connectionId, ...visibilityFilter(caller) },
  });
  if (!conn) throw new NotFoundError("FeedConnection not found");

  const rows = await prisma.feedRun.findMany({
    where: { connectionId },
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 200),
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      status: r.status,
      triggeredBy: r.triggeredBy,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      itemsTotal: r.itemsTotal,
      itemsCreated: r.itemsCreated,
      itemsUpdated: r.itemsUpdated,
      itemsSkippedLocked: r.itemsSkippedLocked,
      itemsFailed: r.itemsFailed,
      errorSummary: r.errorSummary,
    })),
  };
}
