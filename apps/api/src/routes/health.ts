import { prisma } from "@inmolink/db";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const HealthResponse = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  uptime: z.number(),
  checks: z
    .object({
      redis: z.enum(["ok", "down"]).optional(),
      db: z.enum(["ok", "down"]).optional(),
    })
    .optional(),
});

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  // Liveness: process alive, no dependency checks. Used by PM2 + container orchestrators.
  fastify.get(
    "/live",
    {
      schema: {
        tags: ["health"],
        summary: "Liveness probe",
        response: { 200: z.object({ status: z.literal("ok") }) },
      },
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
    },
    async () => ({ status: "ok" as const }),
  );

  // Readiness: deps healthy, ready to serve traffic.
  fastify.get(
    "/ready",
    {
      schema: {
        tags: ["health"],
        summary: "Readiness probe (checks Redis; DB/Meili in later sprints)",
        response: { 200: HealthResponse, 503: HealthResponse },
      },
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
    },
    async (_req, reply) => {
      // Run dependency probes in parallel; each is wrapped so a single
      // failure can't take down the whole readiness check before the
      // others report.
      const [redisStatus, dbStatus] = await Promise.all([
        (async (): Promise<"ok" | "down"> => {
          try {
            return (await app.redis.ping()) === "PONG" ? "ok" : "down";
          } catch {
            return "down";
          }
        })(),
        (async (): Promise<"ok" | "down"> => {
          try {
            // Cheap round-trip; no table access so this stays fast even
            // when the DB is under load.
            await prisma.$queryRaw`SELECT 1`;
            return "ok";
          } catch {
            return "down";
          }
        })(),
      ]);

      const allOk = redisStatus === "ok" && dbStatus === "ok";
      const body = {
        status: allOk ? ("ok" as const) : ("degraded" as const),
        uptime: process.uptime(),
        checks: { redis: redisStatus, db: dbStatus },
      };

      if (!allOk) {
        return reply.code(503).send(body);
      }
      return body;
    },
  );
}
