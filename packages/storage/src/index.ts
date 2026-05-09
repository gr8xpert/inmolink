/**
 * Storage abstraction. PLAN §5 / ADR 0002.
 *
 * Two implementations:
 *   - R2Storage: Cloudflare R2 (S3-compatible) — production
 *   - LocalFsStorage: filesystem-backed dev fallback when R2 not configured
 *
 * Choose at runtime via `createStorage(env)` — the api + worker each get an
 * instance from their config layer.
 */

export {
  hashFromKey,
  keyFromHash,
  variantKeyFromHash,
  type SignedUploadUrl,
  type Storage,
  StorageObjectMissingError,
} from "./interface";
export { type LocalFsConfig, LocalFsStorage } from "./local-fs";
export { type R2Config, R2Storage } from "./r2";
