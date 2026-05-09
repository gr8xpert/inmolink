import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type SignedUploadUrl, type Storage, StorageObjectMissingError } from "./interface";

export type LocalFsConfig = {
  /** Absolute path to the dev storage root. Created if missing. */
  rootDir: string;
  /** Where the local-storage Fastify route lives, e.g. http://localhost:3001 */
  publicBaseUrl: string;
  /** Used to sign + verify the dev "presigned" URLs. */
  signingSecret: string;
  uploadUrlTtlSec?: number;
};

/**
 * LocalFsStorage — dev-only Storage backed by the filesystem.
 *
 * No external dependencies (R2 / S3 / minio). When R2_ENDPOINT is unset,
 * the api falls back to this. Uploads go to `<rootDir>/<key>` and the
 * "presigned" URL is just our own /api/_local-storage/* route signed with
 * an HMAC token (so a malicious client can't write to arbitrary keys).
 *
 * Don't use in production — there's no replication, no CDN, no atomic
 * ops, no metering.
 */
export class LocalFsStorage implements Storage {
  readonly kind = "local-fs" as const;
  private readonly ttl: number;

  constructor(private readonly cfg: LocalFsConfig) {
    this.ttl = cfg.uploadUrlTtlSec ?? 600;
  }

  private absPath(key: string): string {
    // Sanitize: storage keys are constrained by keyFromHash(), but defense
    // in depth — refuse anything escaping rootDir.
    const resolved = path.resolve(this.cfg.rootDir, key);
    const root = path.resolve(this.cfg.rootDir);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error("Path traversal attempt rejected");
    }
    return resolved;
  }

  /** HMAC token bound to (key, expiresAtMs). */
  signToken(key: string, expiresAtMs: number): string {
    const h = createHmac("sha256", this.cfg.signingSecret);
    h.update(`${key}:${expiresAtMs}`);
    return h.digest("hex");
  }

  /** Verify a token issued by signToken(). Returns true if valid + not expired. */
  verifyToken(key: string, expiresAtMs: number, token: string): boolean {
    if (Date.now() > expiresAtMs) return false;
    const expected = this.signToken(key, expiresAtMs);
    if (expected.length !== token.length) return false;
    // Constant-time compare
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  }

  async createUploadUrl(args: {
    key: string;
    mimeType: string;
    bytes: number;
  }): Promise<SignedUploadUrl> {
    const expiresAtMs = Date.now() + this.ttl * 1000;
    const token = this.signToken(args.key, expiresAtMs);
    const uploadUrl = `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/api/_local-storage/upload?key=${encodeURIComponent(args.key)}&exp=${expiresAtMs}&token=${token}`;
    return {
      uploadUrl,
      key: args.key,
      expiresAt: new Date(expiresAtMs),
      requiredHeaders: { "content-type": args.mimeType },
    };
  }

  /** Called by the local-storage upload route after writing the body. */
  async writeFile(key: string, body: Buffer | Uint8Array): Promise<void> {
    const target = this.absPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  /** Read entire file as Buffer. Used by the dev /_local-storage/serve route. */
  async readFile(key: string): Promise<Buffer> {
    return fs.readFile(this.absPath(key));
  }

  async fetchAndHash(key: string): Promise<{ hash: string; bytes: number }> {
    let data: Buffer;
    try {
      data = await fs.readFile(this.absPath(key));
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "ENOENT") {
        throw new StorageObjectMissingError(key);
      }
      throw e;
    }
    const hash = createHash("sha256").update(data).digest("hex");
    return { hash, bytes: data.byteLength };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.absPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.absPath(key));
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "ENOENT") return;
      throw e;
    }
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/api/_local-storage/serve?key=${encodeURIComponent(key)}`;
  }
}
