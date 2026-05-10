import { prisma } from "@inmolink/db";
import type { Job, Processor } from "bullmq";
import type pino from "pino";

/**
 * VIEWING_EXPIRE processor (PLAN §11.6).
 *
 * Hourly tick — promotes any PENDING ViewingRequest past `expiresAt` to
 * `EXPIRED` and emits a notification to both parties so each side sees a
 * clear "request expired" entry in the dashboard.
 *
 * Idempotent: re-running on already-expired rows is a zero-row update.
 * Batch-bounded so a backlog doesn't run away in a single tick.
 */
const BATCH_SIZE = 200;

export function makeViewingExpireProcessor(opts: { logger: pino.Logger }): Processor {
  const { logger } = opts;
  return async (_job: Job) => {
    let totalExpired = 0;
    while (true) {
      const stale = await prisma.viewingRequest.findMany({
        where: { status: "PENDING", expiresAt: { lt: new Date() } },
        select: { id: true, ownerUserId: true, introducerUserId: true },
        take: BATCH_SIZE,
      });
      if (stale.length === 0) break;

      await prisma.$transaction(async (tx) => {
        await tx.viewingRequest.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: { status: "EXPIRED" },
        });
        await tx.notification.createMany({
          data: stale.flatMap((s) => [
            {
              userId: s.ownerUserId,
              kind: "VIEWING_EXPIRING_SOON" as const,
              targetKind: "ViewingRequest",
              targetId: s.id,
            },
            {
              userId: s.introducerUserId,
              kind: "VIEWING_EXPIRING_SOON" as const,
              targetKind: "ViewingRequest",
              targetId: s.id,
            },
          ]),
        });
      });

      totalExpired += stale.length;
      if (stale.length < BATCH_SIZE) break;
    }
    if (totalExpired > 0) logger.info({ totalExpired }, "Viewing requests expired");
    return { totalExpired };
  };
}
