import { prisma } from "@inmolink/db";
import type { uploadSchemas } from "@inmolink/shared";
import { type Storage, StorageObjectMissingError, keyFromHash } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { enqueueEagerImageVariants } from "../../lib/queues";
import { sniffActualMimeType } from "./mime-sniff";

/**
 * Two-step upload flow with content-addressable dedup. PLAN §5.1 / ADR 0002.
 *
 * 1. signUploads(files) — for each {hash}, return either:
 *    - { status: "exists", mediaObjectId } if MediaObject(hash) is in DB, or
 *    - { status: "upload", uploadUrl, key } with a signed PUT URL.
 *    No DB writes here — purely a check + URL signing.
 *
 * 2. registerUploads(uploads) — called after the browser PUTs to uploadUrl.
 *    For each upload, server fetches the bytes from storage, re-hashes
 *    (security check vs malicious clients), then creates MediaObject if
 *    novel. Uses INSERT ... ON CONFLICT to handle the race where two
 *    clients upload the same content simultaneously.
 *
 * refCount stays at 0 here. The Property*Media attach endpoints
 * increment refCount. Orphan cleanup worker collects MediaObjects with
 * refCount=0 + scheduledDeleteAt past (24h grace from creation).
 */

export class UploadVerifyError extends Error {
  readonly statusCode = 422;
  readonly code = "UPLOAD_VERIFY_FAILED";
}

export class UploadMissingError extends Error {
  readonly statusCode = 404;
  readonly code = "UPLOAD_OBJECT_MISSING";
}

const ORPHAN_GRACE_HOURS = 24;

export async function signUploads(
  storage: Storage,
  req: { files: Array<uploadSchemas.SignUploadFile> },
): Promise<{ results: uploadSchemas.SignUploadResult[] }> {
  // Look up which hashes already have a MediaObject (dedup hits).
  const hashes = req.files.map((f) => f.hash);
  const existing = await prisma.mediaObject.findMany({
    where: { hash: { in: hashes } },
    select: { id: true, hash: true, r2Key: true },
  });
  const existingByHash = new Map<string, (typeof existing)[number]>(
    existing.map((m) => [m.hash, m]),
  );

  const results: uploadSchemas.SignUploadResult[] = [];
  for (const file of req.files) {
    const hit = existingByHash.get(file.hash);
    if (hit) {
      results.push({
        hash: file.hash,
        status: "exists",
        mediaObjectId: hit.id,
        key: hit.r2Key,
        publicUrl: storage.publicUrl(hit.r2Key),
      });
      continue;
    }

    const key = keyFromHash(file.hash);
    const signed = await storage.createUploadUrl({
      key,
      mimeType: file.mimeType,
      bytes: file.bytes,
      // Bind hash into the R2 signature so the storage edge enforces it —
      // prevents oversized-garbage uploads against a valid signed URL (#018).
      sha256Hex: file.hash,
    });
    results.push({
      hash: file.hash,
      status: "upload",
      uploadUrl: signed.uploadUrl,
      key: signed.key,
      expiresAt: signed.expiresAt.toISOString(),
      requiredHeaders: signed.requiredHeaders,
    });
  }
  return { results };
}

export async function registerUploads(
  storage: Storage,
  imageVariantQueue: Queue,
  req: { uploads: Array<uploadSchemas.RegisterUploadFile> },
): Promise<{ results: uploadSchemas.RegisterUploadResult[] }> {
  const results: uploadSchemas.RegisterUploadResult[] = [];

  for (const u of req.uploads) {
    const key = keyFromHash(u.hash);

    // Already-registered hash: just return id (no re-fetch needed — we
    // verified at first registration). RefCount unchanged here; attach
    // bumps it.
    const existing = await prisma.mediaObject.findUnique({
      where: { hash: u.hash },
      select: { id: true, bytes: true, r2Key: true },
    });
    if (existing) {
      results.push({
        hash: u.hash,
        mediaObjectId: existing.id,
        publicUrl: storage.publicUrl(existing.r2Key),
        bytes: existing.bytes,
      });
      continue;
    }

    // Novel hash. Re-hash on server in a single round-trip — server is
    // authoritative against malicious clients claiming a hash they don't
    // actually have. The previous separate `exists()` precheck created a
    // TOCTOU window with the orphan-cleanup worker; collapsed to one call.
    let serverHash: string;
    let serverBytes: number;
    try {
      ({ hash: serverHash, bytes: serverBytes } = await storage.fetchAndHash(key));
    } catch (e: unknown) {
      if (e instanceof StorageObjectMissingError) {
        throw new UploadMissingError(`Upload for hash ${u.hash.slice(0, 16)}… not found at ${key}`);
      }
      throw e;
    }
    if (serverHash !== u.hash) {
      throw new UploadVerifyError(
        `Hash mismatch: client claimed ${u.hash.slice(0, 16)}…, server computed ${serverHash.slice(0, 16)}…`,
      );
    }

    // Magic-byte check: trust actual bytes, not the client-claimed mimeType.
    // Range-read only the leading 4 KB — enough for every supported format
    // to identify itself. Crucially we DON'T pull the full object back into
    // API memory (uploads can be 500 MB; 50 per request).
    try {
      const window = await storage.readHead(key, 4096);
      const sniff = sniffActualMimeType(window, u.mimeType);
      if (!sniff.mimeType) {
        throw new UploadVerifyError(
          `Could not identify content type for hash ${u.hash.slice(0, 16)}…`,
        );
      }
      if (!sniff.matches) {
        throw new UploadVerifyError(
          `MIME mismatch: client claimed ${u.mimeType}, server sniffed ${sniff.mimeType}`,
        );
      }
    } catch (e: unknown) {
      if (e instanceof UploadVerifyError) throw e;
      if (e instanceof StorageObjectMissingError) {
        throw new UploadMissingError(`Upload for hash ${u.hash.slice(0, 16)}… disappeared`);
      }
      throw e;
    }

    const scheduledDeleteAt = new Date(Date.now() + ORPHAN_GRACE_HOURS * 3600 * 1000);

    try {
      const created = await prisma.mediaObject.create({
        data: {
          hash: u.hash,
          r2Key: key,
          bytes: serverBytes,
          mimeType: u.mimeType,
          width: u.width ?? null,
          height: u.height ?? null,
          durationSec: u.durationSec ? Math.round(u.durationSec) : null,
          refCount: 0,
          scheduledDeleteAt,
        },
        select: { id: true, bytes: true, r2Key: true },
      });
      // Eager variant generation — thumb + medium WebP. Non-image MIME types
      // are no-ops inside the helper. PLAN §5.
      await enqueueEagerImageVariants(imageVariantQueue, {
        mediaObjectId: created.id,
        sourceHash: u.hash,
        mimeType: u.mimeType,
      });
      results.push({
        hash: u.hash,
        mediaObjectId: created.id,
        publicUrl: storage.publicUrl(created.r2Key),
        bytes: created.bytes,
      });
    } catch (e: unknown) {
      // Race: another client just registered the same hash (P2002 unique).
      const code = (e as Prisma.PrismaClientKnownRequestError)?.code;
      if (code === "P2002") {
        const found = await prisma.mediaObject.findUniqueOrThrow({
          where: { hash: u.hash },
          select: { id: true, bytes: true, r2Key: true },
        });
        results.push({
          hash: u.hash,
          mediaObjectId: found.id,
          publicUrl: storage.publicUrl(found.r2Key),
          bytes: found.bytes,
        });
        continue;
      }
      throw e;
    }
  }

  return { results };
}
