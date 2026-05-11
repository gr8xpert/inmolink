import { chatSchemas } from "@inmolink/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  InvalidArgError,
  NotFoundError,
  getOrCreateDirectThread,
  getThread,
  listMessages,
  listThreads,
  markRead,
  postMessage,
} from "./service";

/**
 * Chat routes (PLAN §11.6). Mounted under /api/dashboard/chat.
 *
 * The HTTP POST is the canonical write surface; Socket.io relays the same
 * payload over the `thread:<id>` room. Clients should treat the HTTP
 * response and the socket event as the same shape (chatSchemas.chatMessageSchema).
 *
 * Socket.io-side subscription: clients emit `chat:thread:join` after the
 * server confirms participation via this REST surface — we do not gate
 * subscriptions on the socket itself to keep the Socket.io adapter dumb.
 */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError)
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    if (err instanceof ForbiddenError)
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
    if (err instanceof InvalidArgError)
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
    throw err;
  });

  const threadIdParam = z.object({ threadId: z.string().min(1) });
  const callerOf = (req: FastifyRequest) => {
    const u = req.requireUser();
    return { userId: u.id, agencyId: u.agencyId, role: u.role };
  };

  fastify.get(
    "/threads",
    {
      schema: {
        tags: ["chat"],
        querystring: chatSchemas.chatThreadListQuerySchema,
        response: { 200: chatSchemas.chatThreadListResponseSchema },
      },
    },
    async (request) => listThreads(callerOf(request), request.query),
  );

  fastify.post(
    "/threads/direct",
    {
      schema: {
        tags: ["chat"],
        summary: "Get or create a 1:1 direct thread between caller + other user",
        body: chatSchemas.directThreadCreateSchema,
        response: { 200: chatSchemas.chatThreadSchema },
      },
    },
    async (request) => getOrCreateDirectThread(callerOf(request), request.body),
  );

  fastify.get(
    "/threads/:threadId",
    {
      schema: {
        tags: ["chat"],
        params: threadIdParam,
        response: { 200: chatSchemas.chatThreadSchema },
      },
    },
    async (request) => getThread(callerOf(request), request.params.threadId),
  );

  fastify.get(
    "/threads/:threadId/messages",
    {
      schema: {
        tags: ["chat"],
        params: threadIdParam,
        querystring: chatSchemas.chatMessageListQuerySchema,
        response: { 200: chatSchemas.chatMessageListResponseSchema },
      },
    },
    async (request) => listMessages(callerOf(request), request.params.threadId, request.query),
  );

  fastify.post(
    "/threads/:threadId/messages",
    {
      schema: {
        tags: ["chat"],
        params: threadIdParam,
        body: chatSchemas.chatMessageCreateSchema,
        response: { 201: chatSchemas.chatMessageSchema },
      },
    },
    async (request, reply) => {
      // app.io may be undefined if Socket.io hasn't booted yet (extremely
      // narrow window during start-up); fall back to REST-only delivery.
      const io = app.io ?? null;
      const m = await postMessage(callerOf(request), request.params.threadId, request.body, io);
      return reply.code(201).send(m);
    },
  );

  fastify.post(
    "/threads/:threadId/read",
    {
      schema: {
        tags: ["chat"],
        params: threadIdParam,
        body: chatSchemas.chatMarkReadSchema,
        response: {
          200: z.object({ ok: z.literal(true), lastReadAt: z.string().datetime() }),
        },
      },
    },
    async (request) => markRead(callerOf(request), request.params.threadId, request.body),
  );
}
