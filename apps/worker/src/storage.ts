import path from "node:path";
import { LocalFsStorage, R2Storage, type Storage } from "@inmolink/storage";
import type { Env } from "./config";

/**
 * Mirrors apps/api/src/storage.ts so the worker can read source originals
 * and PUT generated variants using the same backend.
 */
export function createStorage(env: Env): Storage {
  const hasR2 = !!(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

  if (env.NODE_ENV === "production" && !hasR2) {
    throw new Error(
      "Worker storage misconfigured: NODE_ENV=production requires R2_ENDPOINT, " +
        "R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  if (hasR2) {
    return new R2Storage({
      endpoint: env.R2_ENDPOINT as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucket: env.R2_BUCKET,
      // Worker only does download/put. publicBaseUrl is unused but the type
      // requires it; pass the endpoint so any accidental call stays valid.
      publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? (env.R2_ENDPOINT as string),
    });
  }

  return new LocalFsStorage({
    rootDir: path.resolve(env.LOCAL_STORAGE_ROOT_DIR),
    publicBaseUrl: env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    // Worker never signs upload URLs, so the signing secret is unused; pass a
    // placeholder rather than wiring AUTH_SECRET into the worker.
    signingSecret: "worker-no-sign",
  });
}
