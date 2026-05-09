import path from "node:path";
import { LocalFsStorage, R2Storage, type Storage } from "@inmolink/storage";
import type { Env } from "./config.js";

/**
 * Mirrors apps/api/src/storage.ts so the worker can read source originals
 * and PUT generated variants using the same backend.
 */
export function createStorage(env: Env): Storage {
  if (env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new R2Storage({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      // Worker only does download/put. publicBaseUrl is unused but the type
      // requires it; pass the endpoint so any accidental call stays valid.
      publicBaseUrl: env.R2_ENDPOINT,
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
