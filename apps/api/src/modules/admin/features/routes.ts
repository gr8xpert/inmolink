import { adminFeatureSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  acceptAiIcon,
  createFeature,
  createGroup,
  deleteFeature,
  deleteGroup,
  listFeatures,
  listGroups,
  reorderFeature,
  reorderGroup,
  suggestFeatureIcon,
  updateFeature,
  updateGroup,
} from "./service.js";

/**
 * Super-admin taxonomy curation — FeatureGroup + Feature. Same shape as
 * admin/property-types but for amenities (Lucide icons only, no slug).
 *
 * Mounted under `/api/dashboard/admin/`. Every route calls
 * `request.requireSuperAdmin()`.
 */
export async function adminFeatureRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const idParam = z.object({ id: z.string().min(1) });

  // ─── Groups ──────────────────────────────────────────────────────────

  fastify.get(
    "/feature-groups",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "List FeatureGroups with full translations (super-admin)",
        response: { 200: adminFeatureSchemas.adminFeatureGroupListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listGroups();
    },
  );

  fastify.post(
    "/feature-groups",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Create a FeatureGroup",
        body: adminFeatureSchemas.adminFeatureGroupCreateSchema,
        response: { 201: adminFeatureSchemas.adminFeatureGroupSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createGroup(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/feature-groups/:id",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Update a FeatureGroup (translations replace wholesale)",
        params: idParam,
        body: adminFeatureSchemas.adminFeatureGroupUpdateSchema,
        response: { 200: adminFeatureSchemas.adminFeatureGroupSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateGroup(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/feature-groups/:id",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Delete a FeatureGroup (409 if it still has features)",
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
    "/feature-groups/:id/reorder",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Reorder a FeatureGroup (swap with neighbor at target position)",
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

  // ─── Features ───────────────────────────────────────────────────────

  fastify.get(
    "/features",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "List Features with full translations + icon meta (super-admin)",
        response: { 200: adminFeatureSchemas.adminFeatureListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listFeatures();
    },
  );

  fastify.post(
    "/features",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Create a Feature",
        body: adminFeatureSchemas.adminFeatureCreateSchema,
        response: { 201: adminFeatureSchemas.adminFeatureSchema },
      },
    },
    async (request, reply) => {
      request.requireSuperAdmin();
      const created = await createFeature(request.body);
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/features/:id",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Update a Feature (translations replace wholesale)",
        params: idParam,
        body: adminFeatureSchemas.adminFeatureUpdateSchema,
        response: { 200: adminFeatureSchemas.adminFeatureSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return updateFeature(request.params.id, request.body);
    },
  );

  fastify.delete(
    "/features/:id",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Delete a Feature (409 if still in use; set isActive=false to retire)",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return deleteFeature(request.params.id);
    },
  );

  fastify.post(
    "/features/:id/reorder",
    {
      schema: {
        tags: ["admin", "features"],
        summary: "Reorder a Feature within its group",
        params: idParam,
        body: z.object({ position: z.number().int().min(0) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return reorderFeature(request.params.id, request.body.position);
    },
  );

  // ─── AI icon suggester ─────────────────────────────────────────────

  fastify.post(
    "/features/suggest-icon",
    {
      schema: {
        tags: ["admin", "features", "ai"],
        summary: "Ask Claude Haiku for a Lucide icon name (amenity catalog)",
        body: adminFeatureSchemas.suggestFeatureIconRequestSchema,
        response: { 200: adminFeatureSchemas.suggestFeatureIconResponseSchema },
      },
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request) => {
      request.requireSuperAdmin();
      return suggestFeatureIcon(request.body.name, request.body.hint);
    },
  );

  fastify.post(
    "/features/:id/accept-ai-icon",
    {
      schema: {
        tags: ["admin", "features", "ai"],
        summary: "Accept an AI-suggested icon onto a Feature",
        params: idParam,
        body: z.object({ iconName: z.string().min(1).max(80) }),
        response: { 200: adminFeatureSchemas.adminFeatureSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return acceptAiIcon(request.params.id, request.body.iconName);
    },
  );
}
