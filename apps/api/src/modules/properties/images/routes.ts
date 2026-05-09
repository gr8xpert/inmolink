import { propertyImageSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  attachImagesForUser,
  deleteImageForUser,
  listImagesForUser,
  patchImageForUser,
} from "./service.js";

/**
 * PropertyImage routes. Mounted under the same prefix as propertyRoutes
 * (`/api/dashboard/properties`) so URLs land at:
 *   POST   /:id/images
 *   PATCH  /:id/images/:imageId
 *   DELETE /:id/images/:imageId
 *
 * Auth + ownership enforced in the service layer.
 */
export async function propertyImageRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const propertyParam = z.object({ id: z.string().min(1) });
  const propertyAndImageParam = z.object({
    id: z.string().min(1),
    imageId: z.string().min(1),
  });

  fastify.get(
    "/:id/images",
    {
      schema: {
        tags: ["properties", "images"],
        summary: "List images attached to a property",
        params: propertyParam,
        response: { 200: propertyImageSchemas.listPropertyImagesResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return listImagesForUser(storage, user, request.params.id);
    },
  );

  fastify.post(
    "/:id/images",
    {
      schema: {
        tags: ["properties", "images"],
        summary: "Attach uploaded MediaObjects to a property as images",
        params: propertyParam,
        body: propertyImageSchemas.attachPropertyImagesRequestSchema,
        response: { 201: propertyImageSchemas.attachPropertyImagesResponseSchema },
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const user = request.requireUser();
      const result = await attachImagesForUser(storage, user, request.params.id, request.body);
      return reply.code(201).send(result);
    },
  );

  fastify.patch(
    "/:id/images/:imageId",
    {
      schema: {
        tags: ["properties", "images"],
        summary: "Update PropertyImage (alt text, position, isCover)",
        params: propertyAndImageParam,
        body: propertyImageSchemas.patchPropertyImageRequestSchema,
        response: { 200: propertyImageSchemas.patchPropertyImageResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return patchImageForUser(
        storage,
        user,
        request.params.id,
        request.params.imageId,
        request.body,
      );
    },
  );

  fastify.delete(
    "/:id/images/:imageId",
    {
      schema: {
        tags: ["properties", "images"],
        summary: "Detach a PropertyImage (decrements MediaObject refCount)",
        params: propertyAndImageParam,
        response: { 200: propertyImageSchemas.deletePropertyImageResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return deleteImageForUser(user, request.params.id, request.params.imageId);
    },
  );
}
