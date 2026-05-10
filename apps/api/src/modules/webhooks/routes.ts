import { webhookSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  createEndpoint,
  deleteEndpoint,
  emitTestEvent,
  listEndpoints,
  updateEndpoint,
} from "./service";

type WebhookRoutesOpts = { encryptionKeyHex: string };

const agencyIdQuery = z.object({ agencyId: z.string().min(1).optional() });

/**
 * `/api/dashboard/agency/webhooks` — agency-scoped endpoint config.
 * AGENCY_ADMIN-gated; SUPER_ADMIN may pass `?agencyId=` to manage any
 * agency's endpoints.
 */
export async function webhookRoutes(app: FastifyInstance, opts: WebhookRoutesOpts): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    throw err;
  });

  fastify.get(
    "/",
    {
      schema: {
        tags: ["webhooks"],
        querystring: agencyIdQuery,
        response: { 200: webhookSchemas.webhookEndpointListResponseSchema },
      },
    },
    async (request) => {
      const items = await listEndpoints(request.requireUser(), request.query.agencyId);
      return { items };
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["webhooks"],
        querystring: agencyIdQuery,
        body: webhookSchemas.webhookEndpointInputSchema,
        // Returns the secret in plaintext exactly once on creation so the
        // agency admin can copy it into their server config. Never returned
        // again on subsequent reads.
        response: {
          200: z.object({
            endpoint: webhookSchemas.webhookEndpointSchema,
            secret: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return createEndpoint(
        request.requireUser(),
        request.body,
        opts.encryptionKeyHex,
        request.query.agencyId,
      );
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["webhooks"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: webhookSchemas.webhookEndpointInputSchema,
        response: { 200: webhookSchemas.webhookEndpointSchema },
      },
    },
    async (request) => {
      return updateEndpoint(
        request.requireUser(),
        request.params.id,
        request.body,
        opts.encryptionKeyHex,
        request.query.agencyId,
      );
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["webhooks"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await deleteEndpoint(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  fastify.post(
    "/:id/test",
    {
      schema: {
        tags: ["webhooks"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: webhookSchemas.webhookTestInputSchema,
        response: { 200: z.object({ deliveryId: z.string() }) },
      },
    },
    async (request) => {
      return emitTestEvent(
        request.requireUser(),
        request.params.id,
        request.body.eventType,
        request.query.agencyId,
      );
    },
  );
}
