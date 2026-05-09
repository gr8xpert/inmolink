import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  MEILISEARCH_HOST: z.string().url().default("http://localhost:7700"),
  MEILISEARCH_API_KEY: z.string().default("masterKeyForLocalDevOnly"),
  ENCRYPTION_KEY: z.string().length(32),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Concurrency caps per queue (PLAN §11.7)
  CONCURRENCY_VARIANTS: z.coerce.number().int().positive().default(4),
  CONCURRENCY_IMPORTS: z.coerce.number().int().positive().default(1),
  CONCURRENCY_EMAILS: z.coerce.number().int().positive().default(10),
  CONCURRENCY_WEBHOOKS: z.coerce.number().int().positive().default(5),
  CONCURRENCY_REINDEX: z.coerce.number().int().positive().default(2),

  // R2 (used for variant uploads)
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("inmolink-media"),

  // Anthropic (icon suggester + translation drafts)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Resend (transactional email)
  RESEND_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid worker environment configuration:\n${issues}`);
  }
  return parsed.data;
}
