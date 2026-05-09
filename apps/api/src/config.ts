import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis (cache + BullMQ + Socket.io adapter + sessions)
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // Meilisearch
  MEILISEARCH_HOST: z.string().url().default("http://localhost:7700"),
  MEILISEARCH_API_KEY: z.string().default("masterKeyForLocalDevOnly"),

  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3002")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

  // Auth.js v5
  AUTH_SECRET: z.string().min(32),

  // Encryption key for AES-256-GCM secrets at rest (PLAN §9.3)
  ENCRYPTION_KEY: z.string().length(32),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Rate limit defaults (overridable per route)
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Don't log secrets — surface field names + Zod issues only
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
