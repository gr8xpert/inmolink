import { adminLocationSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createLocation,
  deleteLocation,
  listLocations,
  reorderLocation,
  updateLocation,
} from "./service.js";

/**
 * Super-admin Location curation. 4-level tree (COUNTRY → REGION → CITY
 * → AREA). LocationGroup m2m membership lands in slice 2.C.2.
 *
 * Tree invariants enforced server-side:
 *  - level + parentId are immutable on PATCH (re-parenting is a future
 *    dedicated endpoint).
 *  - 422 INVALID_HIERARCHY on create when parent.level mismatches expected.
 *  - 409 on delete-with-children OR delete-with-property-refs.
 */
export async function adminLocationRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const idParam = z.object({ id: z.string().min(1) });

  fastify.get(
    "/locations",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "List Locations as a flat array (client builds tree by parentId)",
        response: { 200: adminLocationSchemas.adminLocationListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listLocations();
    },
  );

  fastify.post(
    "/locations",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Create a Location (validates level vs parent.level)",
        body: adminLocationSchemas.adminLocationCreateSchema,
        response: { 201: adminLocationSchemas.adminLocationSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createLocation(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/locations/:id",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Update a Location (level + parentId immutable)",
        params: idParam,
        body: adminLocationSchemas.adminLocationUpdateSchema,
        response: { 200: adminLocationSchemas.adminLocationSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateLocation(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/locations/:id",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Delete a Location (409 if it has children or property refs)",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return deleteLocation(request.params.id);
    },
  );

  fastify.post(
    "/locations/:id/reorder",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Reorder a Location within its siblings (same parent + level)",
        params: idParam,
        body: z.object({ position: z.number().int().min(0) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderLocation(request.params.id, request.body.position);
    },
  );
}
