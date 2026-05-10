import { marketingSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getActiveFeatured } from "./featured-service";

/**
 * `/api/public/featured-listings` — anonymous read. Powers the public
 * marketplace homepage and (later) location/search top slots.
 *
 * Cards are pre-projected — no extra round-trip needed from apps/public.
 * Cache headers are deliberately short (60s) so admin curation lands fast.
 */
export async function publicFeaturedRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/featured-listings",
    {
      schema: {
        tags: ["public"],
        querystring: z.object({
          surface: marketingSchemas.featuredSurfaceSchema.default("PUBLIC_HOME"),
          locale: z.string().min(2).max(5).default("en"),
          limit: z.coerce.number().int().min(1).max(24).default(6),
        }),
        response: { 200: marketingSchemas.publicFeaturedListResponseSchema },
      },
    },
    async (request, reply) => {
      const items = await getActiveFeatured(
        request.query.surface,
        request.query.locale,
        request.query.limit,
      );
      reply.header("cache-control", "public, max-age=60, s-maxage=60");
      return { items };
    },
  );
}
