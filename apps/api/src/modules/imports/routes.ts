import { feedConnectionSchemas } from "@inmolink/shared";
import type { Queue } from "bullmq";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  createFeedConnection,
  deleteFeedConnection,
  getFeedConnection,
  listFeedConnections,
  listRuns,
  triggerManualRun,
  updateFeedConnection,
} from "./service";

/**
 * Feed import routes (PLAN §11.5).
 *
 * Mounted under `/api/dashboard/imports`. AGENT-managed; AGENCY_ADMIN can
 * manage any feed in their agency; SUPER_ADMIN can manage any feed.
 */
export async function importRoutes(
  app: FastifyInstance,
  opts: { feedImportQueue: Queue; encryptionKeyHex: string },
): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();
  const { feedImportQueue, encryptionKeyHex } = opts;

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    }
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
    }
    throw err;
  });

  const idParam = z.object({ id: z.string().min(1) });
  const callerOf = (req: FastifyRequest) => {
    const u = req.requireUser();
    return { userId: u.id, agencyId: u.agencyId, role: u.role };
  };

  fastify.get(
    "/",
    {
      schema: {
        tags: ["imports"],
        summary: "List feed connections visible to the caller",
        response: { 200: feedConnectionSchemas.feedConnectionListResponseSchema },
      },
    },
    async (request) => {
      return listFeedConnections(callerOf(request));
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Get a single feed connection",
        params: idParam,
        response: { 200: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request) => {
      return getFeedConnection(callerOf(request), request.params.id);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["imports"],
        summary: "Create a feed connection",
        body: feedConnectionSchemas.feedConnectionCreateSchema,
        response: { 201: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request, reply) => {
      const created = await createFeedConnection(
        callerOf(request),
        request.body,
        feedImportQueue,
        encryptionKeyHex,
      );
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Update a feed connection",
        params: idParam,
        body: feedConnectionSchemas.feedConnectionUpdateSchema,
        response: { 200: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request) => {
      return updateFeedConnection(
        callerOf(request),
        request.params.id,
        request.body,
        feedImportQueue,
        encryptionKeyHex,
      );
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Delete a feed connection",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      return deleteFeedConnection(callerOf(request), request.params.id, feedImportQueue);
    },
  );

  fastify.post(
    "/:id/run",
    {
      schema: {
        tags: ["imports"],
        summary: "Trigger a manual run",
        params: idParam,
        response: { 202: feedConnectionSchemas.manualRunResponseSchema },
      },
    },
    async (request, reply) => {
      const r = await triggerManualRun(callerOf(request), request.params.id, feedImportQueue);
      return reply.code(202).send(r);
    },
  );

  fastify.get(
    "/:id/runs",
    {
      schema: {
        tags: ["imports"],
        summary: "List runs for a feed connection (newest first)",
        params: idParam,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
        response: { 200: feedConnectionSchemas.feedRunListResponseSchema },
      },
    },
    async (request) => {
      return listRuns(callerOf(request), request.params.id, request.query.limit);
    },
  );
}
