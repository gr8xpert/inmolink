import { exportSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PlanRequiredError, requireFeature } from "../billing/plan-tier";
import {
  ForbiddenError,
  GoneError,
  NotFoundError,
  createExport,
  deleteExport,
  getExport,
  getExportForDownload,
  listExports,
} from "./service";

type ExportRoutesOpts = {
  storage: Storage;
  exportQueue: Queue;
};

export async function exportRoutes(app: FastifyInstance, opts: ExportRoutesOpts): Promise<void> {
  const { storage, exportQueue } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    if (err instanceof GoneError) {
      return reply.code(410).send({ statusCode: 410, code: err.code, message: err.message });
    }
    if (err instanceof PlanRequiredError) {
      return reply.code(403).send({
        statusCode: 403,
        code: "PLAN_REQUIRED",
        requiredTier: err.requiredTier,
        message: err.message,
      });
    }
    throw err;
  });

  fastify.get(
    "/",
    {
      schema: {
        tags: ["exports"],
        querystring: exportSchemas.exportListQuerySchema,
        response: { 200: exportSchemas.exportListResponseSchema },
      },
    },
    async (request) => {
      return listExports(request.requireUser(), request.query);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["exports"],
        params: z.object({ id: z.string().min(1) }),
        response: { 200: exportSchemas.exportSchema },
      },
    },
    async (request) => {
      return getExport(request.requireUser(), request.params.id);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["exports"],
        body: exportSchemas.exportCreateSchema,
        response: { 200: exportSchemas.exportSchema },
      },
    },
    async (request) => {
      // Plan-gate per kind. CSV needs feature:export.csv; PDF kinds need feature:export.pdf.
      if (request.body.kind === "CSV") {
        await requireFeature(request, "feature:export.csv");
      } else {
        await requireFeature(request, "feature:export.pdf");
      }
      return createExport(request.requireUser(), request.body, exportQueue);
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["exports"],
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await deleteExport(request.requireUser(), request.params.id, storage);
      return { ok: true as const };
    },
  );

  fastify.get(
    "/:id/download",
    {
      schema: {
        tags: ["exports"],
        params: z.object({ id: z.string().min(1) }),
        // Binary stream — no schema response.
      },
    },
    async (request, reply) => {
      const meta = await getExportForDownload(request.requireUser(), request.params.id);
      const buf = await storage.download(meta.r2Key);
      return reply
        .header("content-type", meta.contentType)
        .header("content-disposition", `attachment; filename="${meta.filename.replace(/"/g, "")}"`)
        .header("content-length", String(buf.length))
        .header("cache-control", "private, no-store")
        .send(buf);
    },
  );
}
