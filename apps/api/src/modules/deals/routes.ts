import { dealSchemas } from "@inmolink/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  cancelDeal,
  confirmDeal,
  createDeal,
  disputeDeal,
  getDeal,
  listDeals,
  listDisputes,
  resolveDispute,
} from "./service";

/**
 * Deal routes (PLAN §11.6). Mounted under /api/dashboard/deals.
 *
 * Visibility: only the listing agent (owner), the introducer, or SUPER_ADMIN.
 * The dispute resolve endpoint is super-admin-only at the service layer.
 */
export async function dealRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError)
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    if (err instanceof ForbiddenError)
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
    if (err instanceof InvalidStateError)
      return reply
        .code(422)
        .send({ statusCode: 422, error: "Unprocessable Entity", message: err.message });
    if (err instanceof ConflictError)
      return reply.code(409).send({ statusCode: 409, error: "Conflict", message: err.message });
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
        tags: ["deals"],
        querystring: dealSchemas.dealListQuerySchema,
        response: { 200: dealSchemas.dealListResponseSchema },
      },
    },
    async (request) => listDeals(callerOf(request), request.query),
  );

  fastify.get(
    "/disputes",
    {
      schema: {
        tags: ["deals"],
        summary: "Super-admin queue of disputed deals",
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: { 200: dealSchemas.dealListResponseSchema },
      },
    },
    async (request) => {
      const caller = callerOf(request);
      if (caller.role !== "SUPER_ADMIN") {
        throw app.httpErrors.forbidden("Super-admin only.");
      }
      return listDisputes(caller, request.query);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["deals"],
        params: idParam,
        response: { 200: dealSchemas.dealSchema },
      },
    },
    async (request) => getDeal(callerOf(request), request.params.id),
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["deals"],
        summary: "Submit a deal proposal",
        body: dealSchemas.dealCreateSchema,
        response: { 201: dealSchemas.dealSchema },
      },
    },
    async (request, reply) => {
      const created = await createDeal(callerOf(request), request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.post(
    "/:id/confirm",
    {
      schema: {
        tags: ["deals"],
        params: idParam,
        body: dealSchemas.dealConfirmSchema,
        response: { 200: dealSchemas.dealSchema },
      },
    },
    async (request) => confirmDeal(callerOf(request), request.params.id, request.body),
  );

  fastify.post(
    "/:id/dispute",
    {
      schema: {
        tags: ["deals"],
        params: idParam,
        body: dealSchemas.dealDisputeSchema,
        response: { 200: dealSchemas.dealSchema },
      },
    },
    async (request) => disputeDeal(callerOf(request), request.params.id, request.body),
  );

  fastify.post(
    "/:id/cancel",
    {
      schema: {
        tags: ["deals"],
        params: idParam,
        response: { 200: dealSchemas.dealSchema },
      },
    },
    async (request) => cancelDeal(callerOf(request), request.params.id),
  );

  fastify.post(
    "/:id/resolve-dispute",
    {
      schema: {
        tags: ["deals"],
        summary: "Resolve a disputed deal (super-admin)",
        params: idParam,
        body: dealSchemas.dealResolveDisputeSchema,
        response: { 200: dealSchemas.dealSchema },
      },
    },
    async (request) => resolveDispute(callerOf(request), request.params.id, request.body),
  );
}
