import { createHash } from "node:crypto";
import { prisma } from "@inmolink/db";
import { mediaSchemas } from "@inmolink/shared";
import { assertSafeUrl } from "@inmolink/shared/ssrf-node";
import { type Storage, keyFromHash } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import type { Logger } from "pino";
import sharp from "sharp";

/**
 * Download a feed-supplied image URL, hash the bytes, and attach it to the
 * Property using the existing dedup pipeline (PLAN §5.1 / ADR 0002).
 *
 * The URL itself is irrelevant for dedup — Kyero's CDN appends a `?v=`
 * cache-buster on every export, so two re-imports of the same content
 * generate two URLs. We hash the response body, look up MediaObject by
 * sha256, and refCount-bump on a hit. On a miss we PUT to storage at the
 * canonical key, create the row, and enqueue the eager variant set.
 *
 * Returns the resolved MediaObject id so the caller can wire it up to a
 * PropertyImage row.
 */
export async function downloadAndDedupImage(args: {
  url: string;
  storage: Storage;
  imageVariantQueue: Queue;
  logger: Logger;
  /** Hard cap on bytes accepted from the feed. Defends against hostile
   *  feeds that try to fill our R2 with multi-GB images. */
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<{ mediaObjectId: string; sha256: string; bytes: number; mimeType: string }> {
  const maxBytes = args.maxBytes ?? 25 * 1024 * 1024; // 25 MB per image (parity with the dashboard cap)

  // SSRF guard: refuse to fetch feed-supplied URLs pointing at localhost,
  // private networks, link-local, or cloud metadata endpoints. We allow
  // http:// here because some legacy XML providers still serve unencrypted.
  await assertSafeUrl(args.url, { allowHttp: true });

  const res = await fetch(args.url, { signal: args.signal, redirect: "manual" });
  if (!res.ok) {
    throw new Error(`Image fetch failed for ${args.url}: ${res.status} ${res.statusText}`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new Error(`Image at ${args.url} exceeds maxBytes (${contentLength} > ${maxBytes})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) {
    throw new Error(`Image at ${args.url} body exceeds maxBytes (${buf.length} > ${maxBytes})`);
  }

  // Validate that we actually got raster image bytes. Magic-byte sniff
  // narrows the candidate set; sharp.metadata() proves the bytes decode as
  // an image of the claimed format. Reject SVG (script-bearing).
  const mimeType = sniffMimeType(buf, res.headers.get("content-type"));
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
    throw new Error(`Image at ${args.url} is not a supported raster image (${mimeType})`);
  }
  try {
    const meta = await sharp(buf, { failOn: "error" }).metadata();
    if (!meta.format || !["jpeg", "png", "webp", "gif", "avif"].includes(meta.format)) {
      throw new Error(`unsupported image format: ${meta.format ?? "unknown"}`);
    }
  } catch (err) {
    throw new Error(
      `Image at ${args.url} failed decode: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");

  // Dedup: if a MediaObject with this hash exists, no upload needed.
  const existing = await prisma.mediaObject.findUnique({
    where: { hash: sha256 },
    select: { id: true, bytes: true },
  });
  if (existing) {
    return { mediaObjectId: existing.id, sha256, bytes: existing.bytes, mimeType };
  }

  // Novel content. Upload to canonical key, create row.
  const key = keyFromHash(sha256);
  await args.storage.put(key, buf, mimeType);

  const scheduledDeleteAt = new Date(Date.now() + 24 * 3600 * 1000);
  let createdId: string;
  let createdBytes: number;
  try {
    const created = await prisma.mediaObject.create({
      data: {
        hash: sha256,
        r2Key: key,
        bytes: buf.length,
        mimeType,
        refCount: 0,
        scheduledDeleteAt,
      },
      select: { id: true, bytes: true },
    });
    createdId = created.id;
    createdBytes = created.bytes;
  } catch (e: unknown) {
    const code = (e as Prisma.PrismaClientKnownRequestError)?.code;
    if (code === "P2002") {
      const found = await prisma.mediaObject.findUniqueOrThrow({
        where: { hash: sha256 },
        select: { id: true, bytes: true },
      });
      createdId = found.id;
      createdBytes = found.bytes;
    } else {
      throw e;
    }
  }

  // Enqueue eager variants — same jobId scheme as the dashboard upload flow
  // (`mediaSchemas.imageVariantJobId(...)`) so duplicates collapse cleanly.
  if (mimeType.startsWith("image/")) {
    const v = mediaSchemas.PIPELINE_VERSION;
    await Promise.all(
      mediaSchemas.EAGER_VARIANTS.map(({ sizeName, format }) =>
        args.imageVariantQueue.add(
          `${sizeName}-${format}`,
          {
            sourceMediaObjectId: createdId,
            sourceHash: sha256,
            sizeName,
            format,
            pipelineVersion: v,
          },
          {
            jobId: mediaSchemas.imageVariantJobId({
              sourceHash: sha256,
              sizeName,
              format,
              pipelineVersion: v,
            }),
          },
        ),
      ),
    );
  }

  return { mediaObjectId: createdId, sha256, bytes: createdBytes, mimeType };
}

/** Lightweight MIME sniff: trust the response header, fall back to magic bytes. */
function sniffMimeType(buf: Buffer, headerMime: string | null): string {
  if (headerMime) {
    const head = headerMime.split(";")[0]?.trim() ?? "";
    if (head.startsWith("image/")) return head;
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}
