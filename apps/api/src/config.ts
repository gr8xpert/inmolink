import { z } from "zod";

/** Empty-string env values are treated as unset. */
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

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
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Auth.js v5
  AUTH_SECRET: z.string().min(32),

  // Encryption key for AES-256-GCM secrets at rest (PLAN §9.3).
  // 32 raw bytes encoded as 64 lowercase hex chars. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Load with `Buffer.from(env.ENCRYPTION_KEY, "hex")` (NOT "utf8").
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "ENCRYPTION_KEY must be 64 lowercase hex chars (32 bytes)"),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Rate limit defaults (overridable per route)
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // Storage — R2 (production) when R2_ENDPOINT is set; LocalFsStorage
  // (dev fallback) otherwise. PLAN §5 / ADR 0002.
  R2_ENDPOINT: optionalUrl,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: z.string().default("inmolink-media"),
  R2_PUBLIC_BASE_URL: optionalString,
  // Local-fs only — used as the dev "presigned URL" host (must match where
  // apps/api is reachable from the browser).
  LOCAL_STORAGE_PUBLIC_BASE_URL: z.string().default("http://localhost:3001"),
  LOCAL_STORAGE_ROOT_DIR: z.string().default("./tmp/r2-local"),

  // Public marketplace URL used in email links.
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),

  // Resend — optional in dev (we log invite links instead). PLAN §1 row 33.
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().default("Inmolink <onboarding@inmolink.local>"),

  // Cloudflare Turnstile — optional. When unset, lead submits skip
  // verification (turnstileVerified=false, lead still saved). When set,
  // a missing or failed token returns the same fake-success as honeypot
  // hits so bots can't tell verified from unverified.
  TURNSTILE_SECRET: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Don't log secrets — surface field names + Zod issues only
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
