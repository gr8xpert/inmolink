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
  const hasR2 = !!(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

  // In production we MUST use R2. Falling back to local filesystem would
  // write real uploads to VPS disk + register dev-only signed-URL routes
  // that bypass CDN/edge protection.
  if (env.NODE_ENV === "production") {
    if (!hasR2) {
      throw new Error(
        "Storage misconfigured: NODE_ENV=production requires R2_ENDPOINT, " +
          "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PUBLIC_BASE_URL.",
      );
    }
    if (!env.R2_PUBLIC_BASE_URL) {
      throw new Error(
        "Storage misconfigured: R2_PUBLIC_BASE_URL must be set in production " +
          "so public media URLs go through the CDN edge, not the R2 endpoint.",
      );
    }
    return new R2Storage({
      endpoint: env.R2_ENDPOINT as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    });
  }

  if (hasR2) {
    return new R2Storage({
      endpoint: env.R2_ENDPOINT as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? (env.R2_ENDPOINT as string),
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
