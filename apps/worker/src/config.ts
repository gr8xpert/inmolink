import { z } from "zod";

/** Treat empty-string env vars as unset. */
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  MEILISEARCH_HOST: z.string().url().default("http://localhost:7700"),
  MEILISEARCH_API_KEY: z.string().default("masterKeyForLocalDevOnly"),
  // 32 raw bytes encoded as 64 lowercase hex chars (matches apps/api).
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "ENCRYPTION_KEY must be 64 lowercase hex chars (32 bytes)"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Concurrency caps per queue (PLAN §11.7)
  CONCURRENCY_VARIANTS: z.coerce.number().int().positive().default(4),
  CONCURRENCY_IMPORTS: z.coerce.number().int().positive().default(1),
  CONCURRENCY_EMAILS: z.coerce.number().int().positive().default(10),
  CONCURRENCY_WEBHOOKS: z.coerce.number().int().positive().default(5),
  CONCURRENCY_REINDEX: z.coerce.number().int().positive().default(2),

  // R2 (used for variant uploads). Empty values in .env treated as unset.
  R2_ENDPOINT: optionalUrl,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: z.string().default("inmolink-media"),
  R2_PUBLIC_BASE_URL: optionalString,

  // Local-fs fallback (mirror of apps/api) — used when R2 vars unset.
  LOCAL_STORAGE_ROOT_DIR: z.string().default("./tmp/r2-local"),
  LOCAL_STORAGE_PUBLIC_BASE_URL: z.string().default("http://localhost:3001"),

  // Anthropic (icon suggester + translation drafts)
  ANTHROPIC_API_KEY: optionalString,

  // Resend (transactional email)
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().default("Inmolink <noreply@inmolink.local>"),

  // Public-app base URL embedded in digest emails (link target).
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Public-app base URL — embedded in sitemap <loc> elements + alternate
  // hreflang links. Defaults to the dev port; prod overrides via env.
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3002"),

  // API base URL embedded in marketing-email tracking links (open / click /
  // unsubscribe). Defaults to the dev api port. PLAN §11.8.
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid worker environment configuration:\n${issues}`);
  }
  return parsed.data;
}
