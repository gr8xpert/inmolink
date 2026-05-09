import { uploadSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { registerUploads, signUploads } from "./service";

export async function uploadRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.post(
    "/sign",
    {
      schema: {
        tags: ["uploads"],
        summary: "Dedup-aware signed upload URL issuance",
        body: uploadSchemas.signUploadRequestSchema,
        response: { 200: uploadSchemas.signUploadResponseSchema },
      },
      // Modest cap — clients shouldn't be hammering this.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      request.requireUser();
      return signUploads(storage, request.body);
    },
  );

  fastify.post(
    "/register",
    {
      schema: {
        tags: ["uploads"],
        summary: "Confirm upload completion (server re-hashes, creates MediaObject)",
        body: uploadSchemas.registerUploadRequestSchema,
        response: { 200: uploadSchemas.registerUploadResponseSchema },
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      request.requireUser();
      return registerUploads(storage, request.body);
    },
  );
}
