import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SignedUploadUrl, Storage } from "./interface";

export type R2Config = {
  endpoint: string; // https://<accountId>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // https://images.inmolink.com (Cloudflare CDN domain in front of R2)
  uploadUrlTtlSec?: number;
};

/**
 * Cloudflare R2 storage (S3-compatible). PLAN §2.2, §5, §11.4.
 *
 * R2 has no egress fees + sits behind Cloudflare → free CDN cache.
 * Uses standard AWS S3 SDK with `region: auto` per Cloudflare docs.
 */
export class R2Storage implements Storage {
  readonly kind = "r2" as const;
  private readonly client: S3Client;
  private readonly ttl: number;

  constructor(private readonly cfg: R2Config) {
    // Per Cloudflare R2 docs (verified 2026-05-09):
    //   region: "auto"   — required by SDK, not used by R2
    //   endpoint        — https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    //   forcePathStyle  — leave at SDK default (false). R2 uses
    //                     <bucket>.<account>.r2.cloudflarestorage.com.
    this.client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    this.ttl = cfg.uploadUrlTtlSec ?? 600; // 10 min default
  }

  async createUploadUrl(args: {
    key: string;
    mimeType: string;
    bytes: number;
  }): Promise<SignedUploadUrl> {
    // Not setting ContentLength on the PUT — locking it would force the
    // browser to send exactly that many bytes (brittle under proxies /
    // tweaks). We re-verify size + hash on /register via fetchAndHash().
    // The `bytes` arg is kept on the interface for storage backends that
    // do enforce it (LocalFsStorage uses it for early sanity checks).
    void args.bytes;
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: args.key,
      ContentType: args.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: this.ttl });
    return {
      uploadUrl,
      key: args.key,
      expiresAt: new Date(Date.now() + this.ttl * 1000),
      requiredHeaders: { "content-type": args.mimeType },
    };
  }

  async fetchAndHash(key: string): Promise<{ hash: string; bytes: number }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`Empty body for key ${key}`);

    const hasher = createHash("sha256");
    let bytes = 0;
    // Body is an async iterable in Node streams mode
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      hasher.update(chunk);
      bytes += chunk.byteLength;
    }
    return { hash: hasher.digest("hex"), bytes };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return true;
    } catch (e: unknown) {
      // S3 SDK throws NotFound (status 404) for missing objects
      if (
        typeof e === "object" &&
        e !== null &&
        ("name" in e ? (e as { name?: string }).name === "NotFound" : false)
      ) {
        return false;
      }
      const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}
