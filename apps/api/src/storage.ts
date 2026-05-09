import path from "node:path";
import { LocalFsStorage, R2Storage, type Storage } from "@inmolink/storage";
import type { Env } from "./config";

/**
 * Build the Storage backend the rest of the api should use.
 *
 * Production: R2Storage (R2_ENDPOINT + creds present).
 * Dev:        LocalFsStorage (no R2 vars set) — writes to LOCAL_STORAGE_ROOT_DIR.
 */
export function createStorage(env: Env): Storage {
  if (env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new R2Storage({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? env.R2_ENDPOINT,
    });
  }

  return new LocalFsStorage({
    rootDir: path.resolve(env.LOCAL_STORAGE_ROOT_DIR),
    publicBaseUrl: env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    // Reuse AUTH_SECRET for HMAC token signing — dev only, no separate secret.
    signingSecret: env.AUTH_SECRET,
  });
}

export type { Storage } from "@inmolink/storage";
