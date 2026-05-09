import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { Redis } from "ioredis";
import type { Env } from "./config";
import { closeQueues, getImageVariantQueue } from "./lib/queues";
import { propertyImageRoutes } from "./modules/properties/images/routes";
import { propertyRoutes } from "./modules/properties/routes";
import { publicPropertyRoutes } from "./modules/public/property-routes";
import { taxonomyRoutes } from "./modules/taxonomy/routes";
import { uploadRoutes } from "./modules/uploads/routes";
import { installAuth } from "./plugins/auth";
import { healthRoutes } from "./routes/health";
import { localStorageRoutes } from "./routes/local-storage";
import { createStorage } from "./storage";

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Pretty in dev only; structured JSON in prod for log aggregators
      ...(env.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
            },
          }
        : {}),
      // PII redaction per PLAN §9.4
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.email",
          "*.phone",
          "*.password",
          "*.passwordHash",
          "*.smtpPassword",
          "*.stripeApiKey",
        ],
        censor: "[redacted]",
      },
    },
    trustProxy: true,
    requestIdLogLabel: "reqId",
    disableRequestLogging: false,
    bodyLimit: 1024 * 1024 * 5, // 5MB; large uploads go direct to R2 via signed URL (PLAN §5)
  });

  // Zod as the type provider for routes + auto OpenAPI schema generation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Redis for rate-limit + cache + BullMQ adapter sharing
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: true,
  });

  app.decorate("redis", redis);

  // Security headers (PLAN §9.3)
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production",
  });

  // CORS — strict allowlist
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // Standard error helpers
  await app.register(sensible);

  // Multipart for file uploads (small files; large uploads use R2 signed URL)
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB — Ticket attachments cap (PLAN §1 row 30)
      files: 5,
    },
  });

  // Redis-backed rate limiter (PLAN §9.3)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    nameSpace: "rl:",
  });

  // OpenAPI / Swagger (PLAN §11.12)
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Inmolink API",
        version: "0.0.0",
        description: "Multi-agent real-estate marketplace API",
      },
      servers: [{ url: "http://localhost:3001", description: "Local" }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Auth — parses Auth.js v5 session cookie set by apps/web, attaches
  // request.user. Installs hook + decorator at root scope (no encapsulation),
  // so subsequently-registered route plugins inherit them.
  installAuth(app, { secret: env.AUTH_SECRET });

  // Storage backend (R2 in prod, LocalFsStorage in dev when R2 vars empty)
  const storage = createStorage(env);
  app.log.info({ kind: storage.kind }, "Storage backend selected");

  // BullMQ producer for image-variant jobs (consumed by apps/worker).
  const imageVariantQueue = getImageVariantQueue(redis);

  // Routes
  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(propertyRoutes, { prefix: "/api/dashboard/properties" });
  await app.register(propertyImageRoutes, { prefix: "/api/dashboard/properties", storage });
  await app.register(taxonomyRoutes, { prefix: "/api/dashboard" });
  await app.register(uploadRoutes, { prefix: "/api/uploads", storage, imageVariantQueue });
  await app.register(publicPropertyRoutes, { prefix: "/api/public", storage });
  await app.register(localStorageRoutes, { prefix: "/api/_local-storage", storage });

  // Graceful shutdown — drain in-flight requests + close queues + Redis (PLAN §11.7)
  app.addHook("onClose", async () => {
    await closeQueues();
    await redis.quit();
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}
