import { adminFeedTypeMapSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../_shared/taxonomy";
import {
  createFeedTypeMap,
  deleteFeedTypeMap,
  listFeedTypeMaps,
  updateFeedTypeMap,
} from "./service";

/**
 * Super-admin curation surface for the feed source-label → PropertyType
 * mapping table (PLAN §11.5). Workers consult this on every import to
 * route raw connector labels (e.g. "Townhouse" from Kyero, "Adosado" from
 * a Spanish-only feed) to canonical PropertyType ids. Unmapped labels
 * still fall back to a translation match; failing that, the property is
 * imported in DRAFT for the agent to triage.
 *
 * Mounted under `/api/dashboard/admin`.
 */
export async function adminFeedTypeMapRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  // Map service-layer errors to friendly HTTP responses.
  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ConflictError) {
      return reply.code(409).send({ statusCode: 409, error: "Conflict", message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    }
    throw err;
  });

  const idParam = z.object({ id: z.string().min(1) });

  fastify.get(
    "/feed-type-maps",
    {
      schema: {
        tags: ["admin", "imports"],
        summary: "List FeedTypeMap rows (super-admin)",
        querystring: adminFeedTypeMapSchemas.adminFeedTypeMapListQuerySchema,
        response: { 200: adminFeedTypeMapSchemas.adminFeedTypeMapListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listFeedTypeMaps(request.query);
    },
  );

  fastify.post(
    "/feed-type-maps",
    {
      schema: {
        tags: ["admin", "imports"],
        summary: "Create a FeedTypeMap row (super-admin)",
        body: adminFeedTypeMapSchemas.adminFeedTypeMapCreateSchema,
        response: { 201: adminFeedTypeMapSchemas.adminFeedTypeMapSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createFeedTypeMap(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/feed-type-maps/:id",
    {
      schema: {
        tags: ["admin", "imports"],
        summary: "Update a FeedTypeMap (super-admin)",
        params: idParam,
        body: adminFeedTypeMapSchemas.adminFeedTypeMapUpdateSchema,
        response: { 200: adminFeedTypeMapSchemas.adminFeedTypeMapSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateFeedTypeMap(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/feed-type-maps/:id",
    {
      schema: {
        tags: ["admin", "imports"],
        summary: "Delete a FeedTypeMap (super-admin)",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return deleteFeedTypeMap(request.params.id);
    },
  );
}
