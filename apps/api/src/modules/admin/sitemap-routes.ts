import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { enqueueSitemapNow, getSitemapQueue } from "../../lib/queues";

/**
 * Super-admin "regenerate sitemap now" — enqueues a one-shot job into the
 * existing daily SITEMAP_GENERATE queue. The worker processor doesn't
 * distinguish manual from cron triggers; both produce the same output set.
 *
 * Coalesced by jobId at minute granularity so accidental double-clicks
 * don't queue two duplicate jobs.
 */
export async function adminSitemapRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.post(
    "/sitemap/regenerate",
    {
      schema: {
        tags: ["admin", "sitemap"],
        summary: "Trigger an immediate sitemap regeneration (super-admin only)",
        response: { 202: z.object({ jobId: z.string() }) },
      },
    },
    async (request, reply) => {
      const user = request.requireSuperAdmin();
      const queue = getSitemapQueue(app.redis);
      const jobId = await enqueueSitemapNow(queue, user.id);
      return reply.code(202).send({ jobId });
    },
  );
}
