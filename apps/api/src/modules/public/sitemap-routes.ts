import { type Storage, StorageObjectMissingError } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Public sitemap proxy. The worker writes per-locale sitemaps to Storage
 * under `sitemaps/` (R2 in prod, LocalFsStorage in dev). The public app
 * exposes route handlers at `/sitemaps/<file>` that proxy into this api
 * so sitemap URLs land on the `*.app` host (where Google expects them)
 * and the public app stays static.
 *
 * Filename allowlist regex is intentionally narrow — anything else is
 * 404 to avoid path-traversal-via-Storage tricks. The worker only writes
 * three patterns:
 *   sitemap.xml
 *   sitemap-properties-<locale>-NNNN.xml
 *   sitemap-locations-<locale>.xml
 *   sitemap-groups-<locale>.xml
 */

const SITEMAP_PREFIX = "sitemaps/";
const FILENAME_RE = /^sitemap(-(properties|locations|groups)-(en|es|de|fr)(-\d{4})?)?\.xml$/;

const filenameParam = z.object({
  filename: z.string().min(1).max(100),
});

export async function publicSitemapRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/sitemaps/:filename",
    {
      schema: {
        tags: ["public", "sitemaps"],
        summary: "Public sitemap proxy",
        params: filenameParam,
      },
      // Tighter than the rest of the public surface — sitemaps are crawled
      // by bots, not humans; 30/min is plenty.
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { filename } = request.params;
      if (!FILENAME_RE.test(filename)) {
        return reply.code(404).send({ error: "Sitemap not found" });
      }

      try {
        const buf = await storage.download(`${SITEMAP_PREFIX}${filename}`);
        return reply
          .header("content-type", "application/xml; charset=utf-8")
          .header("cache-control", "public, max-age=300, s-maxage=3600")
          .send(buf);
      } catch (err) {
        if (err instanceof StorageObjectMissingError) {
          return reply.code(404).send({ error: "Sitemap not generated yet" });
        }
        throw err;
      }
    },
  );
}
