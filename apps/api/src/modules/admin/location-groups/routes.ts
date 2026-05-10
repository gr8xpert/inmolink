import { adminLocationGroupSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  addMember,
  createGroup,
  deleteGroup,
  listGroups,
  removeMember,
  reorderAllGroups,
  reorderAllMembers,
  reorderGroup,
  reorderMember,
  updateGroup,
} from "./service.js";

/**
 * Super-admin LocationGroup curation. Group CRUD mirrors 2.C.1's
 * Location pattern; membership is a separate m2m surface
 * (`/:id/members/*`) so the picker UX doesn't fight the wholesale-
 * replace translations pattern.
 */
export async function adminLocationGroupRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const idParam = z.object({ id: z.string().min(1) });

  fastify.get(
    "/location-groups",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "List LocationGroups with translations + denormalised members",
        response: { 200: adminLocationGroupSchemas.adminLocationGroupListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listGroups();
    },
  );

  fastify.post(
    "/location-groups",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Create a LocationGroup",
        body: adminLocationGroupSchemas.adminLocationGroupCreateSchema,
        response: { 201: adminLocationGroupSchemas.adminLocationGroupSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createGroup(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/location-groups/:id",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Update a LocationGroup (translations replace wholesale)",
        params: idParam,
        body: adminLocationGroupSchemas.adminLocationGroupUpdateSchema,
        response: { 200: adminLocationGroupSchemas.adminLocationGroupSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateGroup(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/location-groups/:id",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Delete a LocationGroup (members cascade-delete)",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return deleteGroup(request.params.id);
    },
  );

  fastify.post(
    "/location-groups/:id/reorder",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Reorder a LocationGroup",
        params: idParam,
        body: z.object({ position: z.number().int().min(0) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderGroup(request.params.id, request.body.position);
    },
  );

  fastify.post(
    "/location-groups/reorder-all",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Reorder all LocationGroups by ordered ids list (drag-drop)",
        body: adminLocationGroupSchemas.adminReorderAllLocationGroupsRequestSchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderAllGroups(request.body.ids);
    },
  );

  fastify.post(
    "/location-groups/members/reorder-all",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Reorder all members within a group by ordered locationIds (drag-drop)",
        body: adminLocationGroupSchemas.adminReorderAllMembersRequestSchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderAllMembers(request.body.groupId, request.body.locationIds);
    },
  );

  // ─── Membership ops ───────────────────────────────────────────────

  fastify.post(
    "/location-groups/:id/members",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Add a Location to a group (409 if already member)",
        params: idParam,
        body: adminLocationGroupSchemas.addMemberRequestSchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return addMember(request.params.id, request.body.locationId, request.body.position);
    },
  );

  fastify.delete(
    "/location-groups/:id/members/:locationId",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Remove a Location from a group",
        params: z.object({
          id: z.string().min(1),
          locationId: z.string().min(1),
        }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return removeMember(request.params.id, request.params.locationId);
    },
  );

  fastify.post(
    "/location-groups/:id/members/reorder",
    {
      schema: {
        tags: ["admin", "locations"],
        summary: "Reorder a member within a group (swap with same-group occupant)",
        params: idParam,
        body: adminLocationGroupSchemas.reorderMemberRequestSchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderMember(request.params.id, request.body.locationId, request.body.position);
    },
  );
}
