import type { LocalFsStorage, Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Dev-only Fastify routes that act as a local stand-in for R2's PUT /
 * GET endpoints. Only registered when storage.kind === "local-fs".
 *
 * PUT  /api/_local-storage/upload?key=...&exp=...&token=...
 *   Accepts the body and writes to <rootDir>/<key>. The token is HMAC
 *   over (key, exp), checked by LocalFsStorage.verifyToken so a
 *   malicious client can't write to arbitrary keys.
 *
 * GET  /api/_local-storage/serve?key=...
 *   Streams the file at <rootDir>/<key> back. Used by
 *   LocalFsStorage.publicUrl() so dev mode can show images without R2.
 *
 * In production these routes are NOT registered — R2 handles storage
 * directly.
 */
export async function localStorageRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  if (opts.storage.kind !== "local-fs") {
    app.log.info("Skipping local-storage routes (storage backend is not local-fs)");
    return;
  }
  const local = opts.storage as LocalFsStorage;

  // Wildcard content-type parser scoped to this plugin (Fastify encapsulates
  // parsers per `app.register` boundary). Without this, PUT requests with
  // image/jpeg etc. get 415 because the default parser only accepts JSON.
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: 500 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  const fastify = app.withTypeProvider<ZodTypeProvider>();

  const uploadQuerySchema = z.object({
    key: z.string(),
    exp: z.string(),
    token: z.string(),
  });

  const serveQuerySchema = z.object({
    key: z.string(),
  });

  fastify.put(
    "/upload",
    {
      schema: { hide: true, querystring: uploadQuerySchema },
      bodyLimit: 500 * 1024 * 1024, // 500 MB
      config: { rateLimit: { max: 200, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { key, exp, token } = request.query;
      const expiresAtMs = Number.parseInt(exp, 10);
      if (!Number.isFinite(expiresAtMs)) {
        return reply.code(400).send({ error: "INVALID_EXP" });
      }
      if (!local.verifyToken(key, expiresAtMs, token)) {
        return reply.code(403).send({ error: "INVALID_TOKEN" });
      }

      // The wildcard content-type parser above gives us request.body as Buffer.
      const body = request.body as Buffer | undefined;
      if (!body || body.length === 0) {
        return reply.code(400).send({ error: "EMPTY_BODY" });
      }
      await local.writeFile(key, body);
      return reply.code(200).send({ ok: true, bytes: body.length });
    },
  );

  fastify.get(
    "/serve",
    { schema: { hide: true, querystring: serveQuerySchema } },
    async (request, reply) => {
      const { key } = request.query;
      if (!(await local.exists(key))) {
        return reply.code(404).send({ error: "NOT_FOUND" });
      }

      const data = await local.readFile(key);
      const range = request.headers.range;

      // Helmet's default Cross-Origin-Resource-Policy is `same-origin`,
      // which blocks <img>/<video> embedding from a different port (web
      // :3000 → api :3001 in dev). R2 serves under its own CDN domain in
      // prod, so this only matters for the dev local-fs route.
      reply.header("cross-origin-resource-policy", "cross-origin");
      reply.header("content-type", sniffContentType(data));

      if (range) {
        // Minimal Range support — useful for <video> playback.
        const match = /^bytes=(\d+)-(\d+)?$/.exec(range);
        if (match) {
          const start = Number.parseInt(match[1] ?? "0", 10);
          const end = match[2] ? Number.parseInt(match[2], 10) : data.byteLength - 1;
          if (start < 0 || end >= data.byteLength || start > end) {
            return reply.code(416).header("content-range", `bytes */${data.byteLength}`).send();
          }
          return reply
            .code(206)
            .header("content-range", `bytes ${start}-${end}/${data.byteLength}`)
            .header("accept-ranges", "bytes")
            .send(data.subarray(start, end + 1));
        }
      }

      return reply.header("accept-ranges", "bytes").send(data);
    },
  );
}

/**
 * Magic-byte sniffer for the dev local-fs serve route. Storage keys are
 * content-addressed hashes with no extension, so we can't infer the type
 * from the URL. Production goes direct to R2 with content-type stored at
 * upload time — this sniffer only runs in dev.
 */
function sniffContentType(data: Buffer): string {
  if (data.length < 12) return "application/octet-stream";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    return "image/gif";
  }
  // WebP: bytes 8-11 = "WEBP"
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  // AVIF / HEIC: bytes 4-7 = "ftyp", bytes 8-11 = brand
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    const brand = data.subarray(8, 12).toString("ascii");
    if (brand === "avif") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
    if (brand === "mp42" || brand === "isom" || brand === "M4V ") return "video/mp4";
  }
  // PDF: %PDF
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "application/pdf";
  }
  return "application/octet-stream";
}
