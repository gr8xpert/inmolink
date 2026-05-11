import { z } from "zod";

// Public marketplace env validation. Next.js inlines `NEXT_PUBLIC_*` vars at
// build time, so we enumerate them by name (object-spreading `process.env`
// would not see them post-build). Validation fires at module load.
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_PUBLIC_URL: z.string().url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

const nonEmpty = (v: string | undefined) => (v && v.length > 0 ? v : undefined);
const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_PUBLIC_URL: process.env.NEXT_PUBLIC_PUBLIC_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: nonEmpty(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid env in apps/public:\n${issues}`);
}

export const env = parsed.data;
