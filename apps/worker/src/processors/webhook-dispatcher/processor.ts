import { prisma } from "@inmolink/db";
import type { Job, Processor, Queue } from "bullmq";
import type pino from "pino";

/**
 * WEBHOOK_DISPATCHER (PLAN §11.10). Ticks every 30 s. Finds PENDING
 * deliveries whose `nextAttemptAt` has elapsed and enqueues each on the
 * WEBHOOK_DELIVER queue.
 *
 * Race-safe: jobs are deduped by deterministic `jobId = wh-deliver:<id>`,
 * so a second dispatcher tick can't double-enqueue. Job options carry the
 * delivery's own retry budget (1 attempt — the dispatcher reschedules by
 * writing `nextAttemptAt`, not via BullMQ retry).
 */

type Args = {
  webhookQueue: Queue;
  logger: pino.Logger;
};

export function makeWebhookDispatcherProcessor(opts: Args): Processor {
  return async function dispatcher(_job: Job): Promise<void> {
    const due = await prisma.webhookDelivery.findMany({
      where: {
        status: "PENDING",
        OR: [{ nextAttemptAt: { lte: new Date() } }, { nextAttemptAt: null }],
      },
      take: 200,
      select: { id: true },
    });
    if (due.length === 0) return;

    for (const d of due) {
      try {
        await opts.webhookQueue.add(
          "deliver",
          { deliveryId: d.id },
          {
            jobId: `wh-deliver:${d.id}`,
            attempts: 1, // application-level retry; we manage scheduling
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 500 },
          },
        );
      } catch (err) {
        opts.logger.error({ err, deliveryId: d.id }, "failed to enqueue webhook delivery");
      }
    }
    opts.logger.info({ enqueued: due.length }, "webhook dispatcher tick");
  };
}
