import { propertySchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit";
import {
  createForUser,
  getOneForDashboard,
  listForDashboard,
  softDeleteForUser,
  updateForUser,
} from "./service";

/**
 * Dashboard property routes. All require authentication.
 * Visibility-filtered per session (PLAN §3 / service.ts).
 */
export async function propertyRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["properties"],
        summary: "List properties (cursor-paginated)",
        querystring: propertySchemas.propertyListQuerySchema,
        response: { 200: propertySchemas.propertyListResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return listForDashboard(user, request.query);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["properties"],
        summary: "Get a single property by id",
        params: z.object({ id: z.string().min(1) }),
        response: { 200: propertySchemas.propertyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return getOneForDashboard(user, request.params.id);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["properties"],
        summary: "Create a property (owner = current user)",
        body: propertySchemas.propertyCreateSchema,
        response: { 201: propertySchemas.propertyDetailSchema },
      },
    },
    async (request, reply) => {
      const user = request.requireUser();
      const created = await createForUser(user, request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["properties"],
        summary: "Update a property (partial)",
        params: z.object({ id: z.string().min(1) }),
        body: propertySchemas.propertyUpdateSchema,
        response: { 200: propertySchemas.propertyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateForUser(user, request.params.id, request.body);
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["properties"],
        summary: "Soft-delete a property (30-day retention)",
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            id: z.string(),
            deletedAt: z.string().datetime().nullable(),
            hardDeleteAt: z.string().datetime().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const user = request.requireUser();
      const r = await softDeleteForUser(user, request.params.id);
      await writeAuditLog({
        type: "PROPERTY_DELETED",
        request,
        actorUserId: user.id,
        agencyId: user.agencyId,
        targetKind: "Property",
        targetId: r.id,
        metadata: { hardDeleteAt: r.hardDeleteAt?.toISOString() ?? null },
      });
      return {
        id: r.id,
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
        hardDeleteAt: r.hardDeleteAt ? r.hardDeleteAt.toISOString() : null,
      };
    },
  );
}
