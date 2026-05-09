/**
 * Storage interface — implemented by R2Storage (production) and
 * LocalFsStorage (dev fallback).
 *
 * Keys are derived from SHA-256 hashes per ADR 0002:
 *   media/<hash[0:2]>/<hash[2:4]>/<hash>
 *
 * `keyFromHash` is the canonical mapping used by every caller; storage
 * implementations don't compute it themselves.
 */

export type SignedUploadUrl = {
  /** Pre-signed PUT URL the browser uploads to directly. */
  uploadUrl: string;
  /** Stable storage key (browser shouldn't care about this; surfaced for observability). */
  key: string;
  /** When the URL stops working. */
  expiresAt: Date;
  /** Optional headers the browser must send with the PUT (Content-Type etc). */
  requiredHeaders: Record<string, string>;
};

export interface Storage {
  /**
   * Issue a presigned PUT URL for a fresh upload.
   * @param key  storage key (use keyFromHash())
   * @param mimeType  MIME type the browser will send
   * @param bytes  total bytes (used for some backends to validate)
   */
  createUploadUrl(args: {
    key: string;
    mimeType: string;
    bytes: number;
  }): Promise<SignedUploadUrl>;

  /**
   * Fetch the object at a key and return its SHA-256 + bytes. Used by
   * /api/uploads/register to verify the client's claimed hash matches the
   * actual bytes (security check against malicious clients).
   */
  fetchAndHash(key: string): Promise<{ hash: string; bytes: number }>;

  /** True if an object exists at the given key. */
  exists(key: string): Promise<boolean>;

  /** Delete the object at a key (used by orphan cleanup worker). */
  delete(key: string): Promise<void>;

  /** Public URL for serving (CDN URL when R2 + Cloudflare). */
  publicUrl(key: string): string;

  /** Identifier for logs / health checks. */
  readonly kind: "r2" | "local-fs";
}

const KEY_PREFIX = "media";

/** Hash → storage key mapping. PLAN §5.1 / ADR 0002. */
export function keyFromHash(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("Hash must be lowercase 64-character hex (SHA-256)");
  }
  return `${KEY_PREFIX}/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

/** Inverse, useful for sanity-checks. */
export function hashFromKey(key: string): string | null {
  const m = key.match(new RegExp(`^${KEY_PREFIX}/[a-f0-9]{2}/[a-f0-9]{2}/([a-f0-9]{64})$`));
  return m ? m[1]! : null;
}
