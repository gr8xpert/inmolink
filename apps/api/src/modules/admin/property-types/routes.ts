import { adminPropertyTypeSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  acceptAiIcon,
  createGroup,
  createType,
  deleteGroup,
  deleteType,
  listGroups,
  listTypes,
  reorderGroup,
  reorderType,
  suggestTypeIcon,
  updateGroup,
  updateType,
} from "./service.js";

/**
 * Super-admin taxonomy curation — PropertyTypeGroup + PropertyType.
 *
 * Mounted under `/api/dashboard/admin/`. Every route calls
 * `request.requireSuperAdmin()` (401 if anon, 403 if non-super-admin).
 * The legacy anon `GET /api/dashboard/property-types` (slice F.2) stays
 * read-only and locale-flattened for the picker UX.
 */
export async function adminPropertyTypeRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const idParam = z.object({ id: z.string().min(1) });

  // ─── Groups ──────────────────────────────────────────────────────────

  fastify.get(
    "/property-type-groups",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "List PropertyTypeGroups with full translations (super-admin)",
        response: {
          200: adminPropertyTypeSchemas.adminPropertyTypeGroupListResponseSchema,
        },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listGroups();
    },
  );

  fastify.post(
    "/property-type-groups",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Create a PropertyTypeGroup",
        body: adminPropertyTypeSchemas.adminPropertyTypeGroupCreateSchema,
        response: { 201: adminPropertyTypeSchemas.adminPropertyTypeGroupSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createGroup(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/property-type-groups/:id",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Update a PropertyTypeGroup (translations replace wholesale)",
        params: idParam,
        body: adminPropertyTypeSchemas.adminPropertyTypeGroupUpdateSchema,
        response: { 200: adminPropertyTypeSchemas.adminPropertyTypeGroupSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateGroup(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/property-type-groups/:id",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Delete a PropertyTypeGroup (409 if it still has types)",
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
    "/property-type-groups/:id/reorder",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Reorder a PropertyTypeGroup (swap with neighbor at target position)",
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

  // ─── Types ───────────────────────────────────────────────────────────

  fastify.get(
    "/property-types",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "List PropertyTypes with full translations + icon meta (super-admin)",
        response: { 200: adminPropertyTypeSchemas.adminPropertyTypeListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listTypes();
    },
  );

  fastify.post(
    "/property-types",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Create a PropertyType",
        body: adminPropertyTypeSchemas.adminPropertyTypeCreateSchema,
        response: { 201: adminPropertyTypeSchemas.adminPropertyTypeSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createType(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/property-types/:id",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Update a PropertyType (translations replace wholesale)",
        params: idParam,
        body: adminPropertyTypeSchemas.adminPropertyTypeUpdateSchema,
        response: { 200: adminPropertyTypeSchemas.adminPropertyTypeSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateType(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/property-types/:id",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Delete a PropertyType (409 if still in use; set isActive=false to retire)",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return deleteType(request.params.id);
    },
  );

  fastify.post(
    "/property-types/:id/reorder",
    {
      schema: {
        tags: ["admin", "property-types"],
        summary: "Reorder a PropertyType within its group",
        params: idParam,
        body: z.object({ position: z.number().int().min(0) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderType(request.params.id, request.body.position);
    },
  );

  // ─── AI icon suggester ──────────────────────────────────────────────

  fastify.post(
    "/property-types/suggest-icon",
    {
      schema: {
        tags: ["admin", "property-types", "ai"],
        summary: "Ask Claude Haiku for a Lucide icon name (super-admin)",
        body: adminPropertyTypeSchemas.suggestIconRequestSchema,
        response: { 200: adminPropertyTypeSchemas.suggestIconResponseSchema },
      },
      // Tighter rate limit — costs an LLM call per request.
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request) => {
      request.requireSuperAdmin();
      return suggestTypeIcon(request.body.name, request.body.hint);
    },
  );

  fastify.post(
    "/property-types/:id/accept-ai-icon",
    {
      schema: {
        tags: ["admin", "property-types", "ai"],
        summary: "Accept an AI-suggested icon onto a PropertyType",
        params: idParam,
        body: z.object({ iconName: z.string().min(1).max(80) }),
        response: { 200: adminPropertyTypeSchemas.adminPropertyTypeSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return acceptAiIcon(request.params.id, request.body.iconName);
    },
  );
}
