import { prisma } from "@inmolink/db";
import type { Storage } from "@inmolink/storage";
import type { Job, Processor } from "bullmq";
import type pino from "pino";

/**
 * EXPORT_CLEANUP (PLAN §11.11). Daily sweep — finds Export rows past
 * `expiresAt`, deletes the R2 object, then deletes the Export row.
 *
 * Storage failure logged + DB GC continues (so a missing object doesn't
 * keep the row alive forever blocking the unique constraint or wasting
 * an index slot).
 */

type Args = {
  storage: Storage;
  logger: pino.Logger;
};

export function makeExportCleanupProcessor(opts: Args): Processor {
  return async function exportCleanupProcessor(_job: Job): Promise<void> {
    const expired = await prisma.export.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, resultR2Key: true },
      take: 500,
    });
    if (expired.length === 0) return;

    let deleted = 0;
    for (const row of expired) {
      if (row.resultR2Key) {
        try {
          await opts.storage.delete(row.resultR2Key);
        } catch (err) {
          opts.logger.warn(
            { err, exportId: row.id, key: row.resultR2Key },
            "export cleanup blob delete failed",
          );
        }
      }
      try {
        await prisma.export.delete({ where: { id: row.id } });
        deleted += 1;
      } catch (err) {
        opts.logger.warn({ err, exportId: row.id }, "export cleanup row delete failed");
      }
    }
    opts.logger.info({ deleted }, "export cleanup tick");
  };
}
