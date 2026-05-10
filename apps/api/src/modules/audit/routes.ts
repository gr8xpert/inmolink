import { prisma } from "@inmolink/db";
import { auditSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/**
 * Super-admin audit log viewer (PLAN §9.4 / §11.12).
 * Cursor-paginated, filter by event type / actor email / agency / target /
 * date range. Mounted at /api/dashboard/admin/audit-log.
 */
export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["admin", "audit"],
        summary: "List audit log entries (cursor-paginated; super-admin only)",
        querystring: auditSchemas.auditLogListQuerySchema,
        response: { 200: auditSchemas.auditLogListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      const { cursor, limit, type, actorEmail, agencyId, targetKind, fromDate, toDate } =
        request.query;
      const cap = Math.min(Math.max(limit ?? 50, 1), 200);

      const decoded = (() => {
        if (!cursor) return null;
        try {
          return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
            createdAt: string;
            id: string;
          };
        } catch {
          return null;
        }
      })();

      const where: Prisma.AuditLogWhereInput = {};
      if (type) where.type = type;
      if (agencyId) where.agencyId = agencyId;
      if (targetKind) where.targetKind = targetKind;
      if (actorEmail) {
        where.actor = { email: { contains: actorEmail, mode: "insensitive" } };
      }
      if (fromDate || toDate) {
        where.createdAt = {
          ...(fromDate ? { gte: new Date(fromDate) } : {}),
          ...(toDate ? { lte: new Date(toDate) } : {}),
        };
      }
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

      const rows = await prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: cap + 1,
        include: {
          actor: { select: { email: true, agency: { select: { name: true } } } },
        },
      });

      const hasMore = rows.length > cap;
      const slice = hasMore ? rows.slice(0, cap) : rows;
      const tail = slice[slice.length - 1];

      return {
        items: slice.map((r) => ({
          id: r.id,
          type: r.type,
          actorUserId: r.actorUserId,
          actorEmail: r.actor?.email ?? null,
          actorIp: r.actorIp,
          actorUa: r.actorUa,
          agencyId: r.agencyId,
          agencyName: r.actor?.agency?.name ?? null,
          targetKind: r.targetKind,
          targetId: r.targetId,
          metadata: r.metadata ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor:
          hasMore && tail
            ? Buffer.from(
                JSON.stringify({ createdAt: tail.createdAt.toISOString(), id: tail.id }),
              ).toString("base64url")
            : null,
      };
    },
  );
}
