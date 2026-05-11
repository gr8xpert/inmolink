import { prisma } from "@inmolink/db";
import type { exportSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
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
export class GoneError extends Error {
  readonly statusCode = 410;
  readonly code = "GONE";
  constructor(message = "Export expired") {
    super(message);
  }
}

function resolveAgencyId(user: AuthenticatedUser): string {
  if (!user.agencyId) {
    throw new ForbiddenError("User has no agency");
  }
  return user.agencyId;
}

function toOutput(row: {
  id: string;
  kind: string;
  status: string;
  locale: string;
  filters: Prisma.JsonValue;
  propertyIds: Prisma.JsonValue;
  resultBytes: number | null;
  expiresAt: Date | null;
  errorMessage: string | null;
  requestedById: string;
  requestedBy: { firstName: string; lastName: string };
  createdAt: Date;
  finishedAt: Date | null;
}): exportSchemas.Export {
  return {
    id: row.id,
    kind: row.kind as exportSchemas.ExportKind,
    status: row.status as exportSchemas.ExportStatus,
    locale: row.locale,
    filters: row.filters,
    propertyIds: row.propertyIds,
    resultBytes: row.resultBytes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    requestedById: row.requestedById,
    requestedByName: `${row.requestedBy.firstName} ${row.requestedBy.lastName}`,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

const INCLUDE = {
  requestedBy: { select: { firstName: true, lastName: true } },
} as const;

export async function listExports(
  user: AuthenticatedUser,
  query: { cursor?: string; limit?: number; kind?: string; status?: string },
) {
  const agencyId = resolveAgencyId(user);
  const cap = Math.min(Math.max(query.limit ?? 25, 1), 100);

  const where: Prisma.ExportWhereInput = { agencyId };
  if (user.role === "AGENT") where.requestedById = user.id;
  if (query.kind) where.kind = query.kind as Prisma.ExportWhereInput["kind"];
  if (query.status) where.status = query.status as Prisma.ExportWhereInput["status"];

  const decoded = (() => {
    if (!query.cursor) return null;
    try {
      return JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as {
        createdAt: string;
        id: string;
      };
    } catch {
      return null;
    }
  })();
  if (decoded) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const rows = await prisma.export.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: cap + 1,
    include: INCLUDE,
  });
  const hasMore = rows.length > cap;
  const slice = hasMore ? rows.slice(0, cap) : rows;
  const tail = slice[slice.length - 1];

  return {
    items: slice.map(toOutput),
    nextCursor:
      hasMore && tail
        ? Buffer.from(
            JSON.stringify({ createdAt: tail.createdAt.toISOString(), id: tail.id }),
          ).toString("base64url")
        : null,
  };
}

export async function getExport(
  user: AuthenticatedUser,
  id: string,
): Promise<exportSchemas.Export> {
  const agencyId = resolveAgencyId(user);
  const where: Prisma.ExportWhereInput = { id, agencyId };
  if (user.role === "AGENT") where.requestedById = user.id;
  const row = await prisma.export.findFirst({ where, include: INCLUDE });
  if (!row) throw new NotFoundError("Export not found");
  return toOutput(row);
}

const RETENTION_DAYS = 7;

export async function createExport(
  user: AuthenticatedUser,
  input: exportSchemas.ExportCreateInput,
  exportQueue: Queue,
): Promise<exportSchemas.Export> {
  const agencyId = resolveAgencyId(user);

  const created = await prisma.export.create({
    data: {
      agencyId,
      requestedById: user.id,
      kind: input.kind,
      locale: input.locale,
      filters: (input.filters ?? null) as Prisma.InputJsonValue,
      propertyIds: (input.propertyIds ?? null) as Prisma.InputJsonValue,
      status: "QUEUED",
      expiresAt: new Date(Date.now() + RETENTION_DAYS * 24 * 3600 * 1000),
    },
    include: INCLUDE,
  });

  await exportQueue.add(
    "generate",
    { exportId: created.id },
    {
      jobId: `export-${created.id}`,
      attempts: 1, // surface failures via Export.status; BullMQ retry would skew the row
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  );

  return toOutput(created);
}

export async function deleteExport(
  user: AuthenticatedUser,
  id: string,
  storage: Storage,
): Promise<void> {
  const agencyId = resolveAgencyId(user);
  const where: Prisma.ExportWhereInput = { id, agencyId };
  if (user.role === "AGENT") where.requestedById = user.id;
  const row = await prisma.export.findFirst({
    where,
    select: { id: true, resultR2Key: true },
  });
  if (!row) throw new NotFoundError("Export not found");
  if (row.resultR2Key) {
    await storage.delete(row.resultR2Key).catch(() => undefined);
  }
  await prisma.export.delete({ where: { id } });
}

/**
 * Used by the download proxy. Returns the row with R2 key + content type
 * iff the caller may access. Throws on missing / not-yet-ready / expired.
 */
export async function getExportForDownload(
  user: AuthenticatedUser,
  id: string,
): Promise<{
  r2Key: string;
  filename: string;
  contentType: string;
  bytes: number;
}> {
  const agencyId = resolveAgencyId(user);
  const where: Prisma.ExportWhereInput = { id, agencyId };
  if (user.role === "AGENT") where.requestedById = user.id;
  const row = await prisma.export.findFirst({
    where,
    select: {
      kind: true,
      status: true,
      resultR2Key: true,
      resultBytes: true,
      expiresAt: true,
      errorMessage: true,
    },
  });
  if (!row) throw new NotFoundError("Export not found");
  if (row.status !== "SUCCESS" || !row.resultR2Key) {
    throw new ForbiddenError(`Export not ready (status=${row.status})`);
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new GoneError("Export has expired");
  }
  const ext = row.kind === "CSV" ? "csv" : "pdf";
  const contentType = row.kind === "CSV" ? "text/csv; charset=utf-8" : "application/pdf";
  return {
    r2Key: row.resultR2Key,
    filename: `inmolink-${id}.${ext}`,
    contentType,
    bytes: row.resultBytes ?? 0,
  };
}
