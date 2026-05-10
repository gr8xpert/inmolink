import { viewingRequestSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  acceptViewingRequest,
  cancelViewingRequest,
  createViewingRequest,
  declineViewingRequest,
  getViewingRequest,
  listViewingRequests,
  rescheduleViewingRequest,
  setViewingOutcome,
} from "./service";

/**
 * ViewingRequest routes (PLAN §11.6). Mounted under /api/dashboard/viewings.
 *
 * Visibility: only the listing agent (owner), the requesting agent
 * (introducer) or SUPER_ADMIN may read or act.
 */
export async function viewingRequestRoutes(
  app: FastifyInstance,
  opts: { encryptionKeyHex: string; storage: Storage },
): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();
  const { encryptionKeyHex, storage } = opts;

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError)
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    if (err instanceof ForbiddenError)
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
    if (err instanceof InvalidStateError)
      return reply
        .code(422)
        .send({ statusCode: 422, error: "Unprocessable Entity", message: err.message });
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
        tags: ["viewings"],
        summary: "List viewing requests for the caller",
        querystring: viewingRequestSchemas.viewingRequestListQuerySchema,
        response: { 200: viewingRequestSchemas.viewingRequestListResponseSchema },
      },
    },
    async (request) => {
      return listViewingRequests(callerOf(request), request.query, encryptionKeyHex, storage);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["viewings"],
        summary: "Fetch one viewing request",
        params: idParam,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) => {
      return getViewingRequest(callerOf(request), request.params.id, encryptionKeyHex, storage);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["viewings"],
        summary: "Create a viewing request",
        body: viewingRequestSchemas.viewingRequestCreateSchema,
        response: { 201: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request, reply) => {
      const created = await createViewingRequest(
        callerOf(request),
        request.body,
        encryptionKeyHex,
        storage,
      );
      return reply.code(201).send(created);
    },
  );

  fastify.post(
    "/:id/accept",
    {
      schema: {
        tags: ["viewings"],
        summary: "Accept a viewing request (owner)",
        params: idParam,
        body: viewingRequestSchemas.viewingRequestAcceptSchema,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) =>
      acceptViewingRequest(
        callerOf(request),
        request.params.id,
        request.body,
        encryptionKeyHex,
        storage,
      ),
  );

  fastify.post(
    "/:id/decline",
    {
      schema: {
        tags: ["viewings"],
        summary: "Decline a viewing request (owner)",
        params: idParam,
        body: viewingRequestSchemas.viewingRequestDeclineSchema,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) =>
      declineViewingRequest(
        callerOf(request),
        request.params.id,
        request.body,
        encryptionKeyHex,
        storage,
      ),
  );

  fastify.post(
    "/:id/reschedule",
    {
      schema: {
        tags: ["viewings"],
        summary: "Propose a new time (either party)",
        params: idParam,
        body: viewingRequestSchemas.viewingRequestRescheduleSchema,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) =>
      rescheduleViewingRequest(
        callerOf(request),
        request.params.id,
        request.body,
        encryptionKeyHex,
        storage,
      ),
  );

  fastify.post(
    "/:id/cancel",
    {
      schema: {
        tags: ["viewings"],
        summary: "Cancel a viewing (either party)",
        params: idParam,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) =>
      cancelViewingRequest(callerOf(request), request.params.id, encryptionKeyHex, storage),
  );

  fastify.post(
    "/:id/outcome",
    {
      schema: {
        tags: ["viewings"],
        summary: "Record the outcome of a completed viewing (owner)",
        params: idParam,
        body: viewingRequestSchemas.viewingRequestOutcomeSchema,
        response: { 200: viewingRequestSchemas.viewingRequestSchema },
      },
    },
    async (request) =>
      setViewingOutcome(
        callerOf(request),
        request.params.id,
        request.body,
        encryptionKeyHex,
        storage,
      ),
  );
}
