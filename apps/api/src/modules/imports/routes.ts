import { feedConnectionSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Queue } from "bullmq";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  createFeedConnection,
  deleteFeedConnection,
  getFeedConnection,
  listFeedConnections,
  listRuns,
  triggerManualRun,
  updateFeedConnection,
  uploadManualXml,
} from "./service";

/**
 * Feed import routes (PLAN §11.5).
 *
 * Mounted under `/api/dashboard/imports`. AGENT-managed; AGENCY_ADMIN can
 * manage any feed in their agency; SUPER_ADMIN can manage any feed.
 */
export async function importRoutes(
  app: FastifyInstance,
  opts: { feedImportQueue: Queue; encryptionKeyHex: string; storage: Storage },
): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();
  const { feedImportQueue, encryptionKeyHex, storage } = opts;

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: err.message });
    }
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
    }
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
        tags: ["imports"],
        summary: "List feed connections visible to the caller",
        querystring: feedConnectionSchemas.feedConnectionListQuerySchema,
        response: { 200: feedConnectionSchemas.feedConnectionListResponseSchema },
      },
    },
    async (request) => {
      return listFeedConnections(callerOf(request), request.query);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Get a single feed connection",
        params: idParam,
        response: { 200: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request) => {
      return getFeedConnection(callerOf(request), request.params.id);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["imports"],
        summary: "Create a feed connection",
        body: feedConnectionSchemas.feedConnectionCreateSchema,
        response: { 201: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request, reply) => {
      const created = await createFeedConnection(
        callerOf(request),
        request.body,
        feedImportQueue,
        encryptionKeyHex,
      );
      return reply.code(201).send(created);
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Update a feed connection",
        params: idParam,
        body: feedConnectionSchemas.feedConnectionUpdateSchema,
        response: { 200: feedConnectionSchemas.feedConnectionSchema },
      },
    },
    async (request) => {
      return updateFeedConnection(
        callerOf(request),
        request.params.id,
        request.body,
        feedImportQueue,
        encryptionKeyHex,
      );
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["imports"],
        summary: "Delete a feed connection",
        params: idParam,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      return deleteFeedConnection(callerOf(request), request.params.id, feedImportQueue, storage);
    },
  );

  // Manual one-off XML upload (PLAN §11.5). Multipart form: file + kind +
  // optional fieldMappings JSON for GENERIC_XML.
  fastify.post(
    "/upload-xml",
    {
      schema: {
        tags: ["imports"],
        summary: "Manual XML upload — one-off import without persistent feed",
        consumes: ["multipart/form-data"],
        response: {
          202: z.object({
            connectionId: z.string(),
            runId: z.string(),
            jobId: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const caller = callerOf(request);
      // Manual XML upload is a DEV/SAMPLE-feed convenience: the file is
      // buffered into memory and persisted as a single object. Production
      // imports always use URL-based feed connections which the worker
      // streams via SAX. The 10 MB cap is deliberate — PLAN §11.5 warns
      // Kyero/Resale Online feeds can exceed 100 MB and must not be
      // uploaded through this path. Surface that explicitly to the caller
      // when they bump up against it.
      const data = await request.file({ limits: { fileSize: 10 * 1024 * 1024 } });
      if (!data) {
        throw app.httpErrors.badRequest("Missing file part");
      }
      const buf = await data.toBuffer();
      if (data.file.truncated) {
        throw app.httpErrors.payloadTooLarge(
          "Manual upload exceeds 10 MB. Use a URL-based feed connection for production feeds.",
        );
      }

      const kindRaw = (data.fields.kind as { value?: string } | undefined)?.value ?? "";
      const fieldMappingsRaw =
        (data.fields.fieldMappings as { value?: string } | undefined)?.value ?? "";

      const kindParsed = feedConnectionSchemas.feedConnectorKindSchema.safeParse(kindRaw);
      if (!kindParsed.success) {
        throw app.httpErrors.badRequest(`Invalid kind: ${kindRaw}`);
      }

      let fieldMappings: feedConnectionSchemas.FeedConnection["fieldMappings"] | null = null;
      if (kindParsed.data === "GENERIC_XML") {
        if (!fieldMappingsRaw) {
          throw app.httpErrors.badRequest("fieldMappings required for GENERIC_XML");
        }
        try {
          const json = JSON.parse(fieldMappingsRaw);
          const parsed =
            feedConnectionSchemas.feedConnectionCreateSchema.shape.fieldMappings.safeParse(json);
          if (!parsed.success) {
            throw app.httpErrors.badRequest(
              parsed.error.issues[0]?.message ?? "Invalid fieldMappings",
            );
          }
          fieldMappings = parsed.data ?? null;
        } catch (err) {
          if (err && typeof err === "object" && "statusCode" in err) throw err;
          throw app.httpErrors.badRequest("fieldMappings is not valid JSON");
        }
      }

      const r = await uploadManualXml(
        caller,
        {
          kind: kindParsed.data,
          fileBuffer: buf,
          filename: data.filename ?? "upload.xml",
          contentType: data.mimetype || "application/xml",
          fieldMappings,
        },
        storage,
        feedImportQueue,
      );
      return reply.code(202).send(r);
    },
  );

  fastify.post(
    "/:id/run",
    {
      schema: {
        tags: ["imports"],
        summary: "Trigger a manual run",
        params: idParam,
        response: { 202: feedConnectionSchemas.manualRunResponseSchema },
      },
    },
    async (request, reply) => {
      const r = await triggerManualRun(callerOf(request), request.params.id, feedImportQueue);
      return reply.code(202).send(r);
    },
  );

  fastify.get(
    "/:id/runs",
    {
      schema: {
        tags: ["imports"],
        summary: "List runs for a feed connection (newest first)",
        params: idParam,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
        response: { 200: feedConnectionSchemas.feedRunListResponseSchema },
      },
    },
    async (request) => {
      return listRuns(callerOf(request), request.params.id, request.query.limit);
    },
  );
}
