import { prisma } from "@inmolink/db";
import { webhookSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit";

/**
 * Super-admin webhook delivery viewer + manual replay.
 * Mounted at /api/dashboard/admin/webhook-deliveries.
 */
export async function adminWebhookDeliveryRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["admin", "webhooks"],
        summary: "List webhook deliveries (super-admin)",
        querystring: webhookSchemas.webhookDeliveryListQuerySchema,
        response: { 200: webhookSchemas.webhookDeliveryListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      const { cursor, limit, status, agencyId, eventType, endpointId } = request.query;
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

      const where: Prisma.WebhookDeliveryWhereInput = {};
      if (status) where.status = status;
      if (endpointId) where.endpointId = endpointId;
      const eventFilter: Prisma.WebhookEventWhereInput = {};
      if (eventType) eventFilter.type = eventType;
      if (agencyId) eventFilter.agencyId = agencyId;
      if (Object.keys(eventFilter).length > 0) where.event = eventFilter;
      if (decoded) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            // Order by event.createdAt — proxy via lastAttemptAt isn't
            // reliable for never-tried PENDING rows. We approximate with
            // the WebhookDelivery PK's monotonicity via id.
            OR: [{ id: { lt: decoded.id } }],
          },
        ];
      }

      const rows = await prisma.webhookDelivery.findMany({
        where,
        orderBy: [{ id: "desc" }],
        take: cap + 1,
        include: {
          event: { select: { id: true, type: true, createdAt: true, agencyId: true } },
          endpoint: {
            select: { id: true, url: true, agency: { select: { id: true, name: true } } },
          },
        },
      });

      const hasMore = rows.length > cap;
      const slice = hasMore ? rows.slice(0, cap) : rows;
      const tail = slice[slice.length - 1];

      return {
        items: slice.map((r) => ({
          id: r.id,
          eventId: r.event.id,
          eventType: r.event.type as webhookSchemas.WebhookEventType,
          endpointId: r.endpoint.id,
          endpointUrl: r.endpoint.url,
          agencyId: r.event.agencyId,
          agencyName: r.endpoint.agency?.name ?? null,
          status: r.status as webhookSchemas.WebhookDeliveryStatus,
          attemptCount: r.attemptCount,
          lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
          nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
          succeededAt: r.succeededAt?.toISOString() ?? null,
          deadLetteredAt: r.deadLetteredAt?.toISOString() ?? null,
          responseStatus: r.responseStatus,
          errorMessage: r.errorMessage,
          createdAt: r.event.createdAt.toISOString(),
        })),
        nextCursor:
          hasMore && tail
            ? Buffer.from(
                JSON.stringify({ createdAt: tail.event.createdAt.toISOString(), id: tail.id }),
              ).toString("base64url")
            : null,
      };
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["admin", "webhooks"],
        summary: "Webhook delivery detail with attempt history",
        params: z.object({ id: z.string().min(1) }),
        response: { 200: webhookSchemas.webhookDeliveryDetailSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      const r = await prisma.webhookDelivery.findUnique({
        where: { id: request.params.id },
        include: {
          event: {
            select: { id: true, type: true, createdAt: true, agencyId: true, payload: true },
          },
          endpoint: {
            select: { id: true, url: true, agency: { select: { id: true, name: true } } },
          },
          attempts: { orderBy: [{ attemptedAt: "asc" }] },
        },
      });
      if (!r) {
        throw app.httpErrors.notFound("Delivery not found");
      }
      return {
        id: r.id,
        eventId: r.event.id,
        eventType: r.event.type as webhookSchemas.WebhookEventType,
        endpointId: r.endpoint.id,
        endpointUrl: r.endpoint.url,
        agencyId: r.event.agencyId,
        agencyName: r.endpoint.agency?.name ?? null,
        status: r.status as webhookSchemas.WebhookDeliveryStatus,
        attemptCount: r.attemptCount,
        lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
        nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
        succeededAt: r.succeededAt?.toISOString() ?? null,
        deadLetteredAt: r.deadLetteredAt?.toISOString() ?? null,
        responseStatus: r.responseStatus,
        errorMessage: r.errorMessage,
        createdAt: r.event.createdAt.toISOString(),
        payload: r.event.payload,
        attempts: r.attempts.map((a) => ({
          id: a.id,
          attemptedAt: a.attemptedAt.toISOString(),
          responseStatus: a.responseStatus,
          responseBodyTrunc: a.responseBodyTrunc,
          errorMessage: a.errorMessage,
          durationMs: a.durationMs,
        })),
      };
    },
  );

  fastify.post(
    "/:id/replay",
    {
      schema: {
        tags: ["admin", "webhooks"],
        summary: "Reset a delivery to PENDING and re-enqueue immediately",
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      const user = request.requireSuperAdmin();
      const updated = await prisma.webhookDelivery.updateMany({
        where: { id: request.params.id },
        data: {
          status: "PENDING",
          nextAttemptAt: new Date(),
          deadLetteredAt: null,
          errorMessage: null,
        },
      });
      if (updated.count === 0) {
        throw app.httpErrors.notFound("Delivery not found");
      }
      await writeAuditLog({
        type: "WEBHOOK_REPLAYED",
        request,
        actorUserId: user.id,
        targetKind: "WebhookDelivery",
        targetId: request.params.id,
      });
      return { ok: true as const };
    },
  );
}
