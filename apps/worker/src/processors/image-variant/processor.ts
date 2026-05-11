import { prisma } from "@inmolink/db";
import { mediaSchemas } from "@inmolink/shared";
import {
  type Storage,
  StorageObjectMissingError,
  keyFromHash,
  variantKeyFromHash,
} from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import type { Logger } from "pino";
import { generateVariant, variantContentType } from "./pipeline";

/**
 * IMAGE_VARIANT job processor. PLAN §5 / §5.1 / ADR 0002.
 *
 * Idempotent + dedup-aware:
 *   1. If a MediaVariant for (sourceMediaObjectId, sizeName, format,
 *      pipelineVersion) already exists → no-op.
 *   2. Download source from storage, run sharp, hash output.
 *   3. If a MediaVariant with that output hash already exists (cross-source
 *      dedup), bump its refCount + skip the upload.
 *   4. PUT the variant to storage and create the MediaVariant row. P2002
 *      from a concurrent worker collapses to step 3.
 *
 * Throws StorageObjectMissingError → job fails (BullMQ retries with
 * exponential backoff). All other errors propagate to BullMQ for retry.
 */
export function makeImageVariantProcessor(deps: { storage: Storage; logger: Logger }) {
  const { storage, logger } = deps;

  return async function processImageVariantJob(job: Job<unknown>): Promise<{
    skipped?: boolean;
    variantHash?: string;
    bytes?: number;
  }> {
    const data = mediaSchemas.imageVariantJobSchema.parse(job.data);
    const log = logger.child({
      jobId: job.id,
      sourceMediaObjectId: data.sourceMediaObjectId,
      sizeName: data.sizeName,
      format: data.format,
      pipelineVersion: data.pipelineVersion,
    });

    // Step 1 — dedup by (source × size × format × version).
    const existingForSource = await prisma.mediaVariant.findFirst({
      where: {
        sourceMediaObjectId: data.sourceMediaObjectId,
        sizeName: data.sizeName,
        format: data.format,
        pipelineVersion: data.pipelineVersion,
      },
      select: { id: true, hash: true, bytes: true },
    });
    if (existingForSource) {
      log.debug({ variantHash: existingForSource.hash }, "variant already present, skipping");
      return { skipped: true, variantHash: existingForSource.hash, bytes: existingForSource.bytes };
    }

    // Step 2 — fetch source + run sharp.
    const sourceKey = keyFromHash(data.sourceHash);
    const source = await storage.download(sourceKey);
    const variant = await generateVariant(source, data.sizeName, data.format);

    // Step 3 — global dedup by output hash.
    const existingByHash = await prisma.mediaVariant.findUnique({
      where: { hash: variant.hash },
      select: { id: true, bytes: true },
    });
    if (existingByHash) {
      // Two source MediaObjects produced byte-identical variants. Track the
      // additional reference but skip the storage PUT.
      await prisma.mediaVariant.update({
        where: { id: existingByHash.id },
        data: { refCount: { increment: 1 } },
      });
      log.info({ variantHash: variant.hash }, "variant hash collision — refCount bumped");
      return { skipped: true, variantHash: variant.hash, bytes: existingByHash.bytes };
    }

    // Step 4 — PUT + DB row.
    const variantKey = variantKeyFromHash(variant.hash);
    await storage.put(variantKey, variant.buffer, variantContentType(data.format));

    try {
      await prisma.mediaVariant.create({
        data: {
          sourceMediaObjectId: data.sourceMediaObjectId,
          hash: variant.hash,
          format: data.format,
          sizeName: data.sizeName,
          width: variant.width,
          height: variant.height,
          bytes: variant.bytes,
          refCount: 1,
          pipelineVersion: data.pipelineVersion,
        },
      });
    } catch (e: unknown) {
      // Race: another worker just produced the same variant hash. Bump the
      // existing row's refCount instead.
      if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
        await prisma.mediaVariant.update({
          where: { hash: variant.hash },
          data: { refCount: { increment: 1 } },
        });
        log.info({ variantHash: variant.hash }, "variant create race — refCount bumped");
      } else {
        throw e;
      }
    }

    log.info({ variantHash: variant.hash, bytes: variant.bytes }, "variant generated");
    return { variantHash: variant.hash, bytes: variant.bytes };
  };
}

export { StorageObjectMissingError };
