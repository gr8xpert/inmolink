import { z } from "zod";

// Dashboard env validation. Next.js inlines `NEXT_PUBLIC_*` vars at build
// time, so we enumerate them by name (object-spreading `process.env` would
// not see them post-build). Validation fires at module load.
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_PUBLIC_URL: z.string().url(),
  NEXT_PUBLIC_CDN_URL: z.string().url().optional(),
});

const nonEmpty = (v: string | undefined) => (v && v.length > 0 ? v : undefined);
const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_PUBLIC_URL: process.env.NEXT_PUBLIC_PUBLIC_URL,
  NEXT_PUBLIC_CDN_URL: nonEmpty(process.env.NEXT_PUBLIC_CDN_URL),
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid env in apps/web:\n${issues}`);
}

export const env = parsed.data;
