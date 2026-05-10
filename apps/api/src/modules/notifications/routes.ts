import { prisma } from "@inmolink/db";
import { notificationSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * In-app notifications surface (PLAN §11.6). Mounted under
 * /api/dashboard/notifications. Powers the dashboard bell + dropdown.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const callerOf = (req: FastifyRequest) => {
    const u = req.requireUser();
    return { userId: u.id };
  };

  fastify.get(
    "/",
    {
      schema: {
        tags: ["notifications"],
        querystring: notificationSchemas.notificationListQuerySchema,
        response: { 200: notificationSchemas.notificationListResponseSchema },
      },
    },
    async (request) => {
      const { userId } = callerOf(request);
      const { unreadOnly, cursor, limit } = request.query;

      const where: Prisma.NotificationWhereInput = { userId };
      if (unreadOnly) where.readAt = null;

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
      if (decoded) {
        where.OR = [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ];
      }

      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);
      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;
      const tail = slice[slice.length - 1];
      const nextCursor =
        hasMore && tail
          ? Buffer.from(
              JSON.stringify({ createdAt: tail.createdAt.toISOString(), id: tail.id }),
            ).toString("base64url")
          : null;
      return {
        items: slice.map((n) => ({
          id: n.id,
          kind: n.kind,
          targetKind: n.targetKind,
          targetId: n.targetId,
          payload: n.payload,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
        nextCursor,
        unreadCount,
      };
    },
  );

  fastify.post(
    "/read-all",
    {
      schema: {
        tags: ["notifications"],
        response: { 200: z.object({ ok: z.literal(true), updated: z.number().int() }) },
      },
    },
    async (request) => {
      const { userId } = callerOf(request);
      const r = await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true as const, updated: r.count };
    },
  );

  fastify.post(
    "/:id/read",
    {
      schema: {
        tags: ["notifications"],
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      const { userId } = callerOf(request);
      const r = await prisma.notification.updateMany({
        where: { id: request.params.id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      if (r.count === 0) {
        throw app.httpErrors.notFound("Notification not found.");
      }
      return { ok: true as const };
    },
  );
}
