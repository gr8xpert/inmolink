import { createHmac } from "node:crypto";
import { decryptFromString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { Job, Processor } from "bullmq";
import type pino from "pino";

/**
 * WEBHOOK_DELIVER processor (PLAN §11.10).
 *
 * One job = one WebhookDelivery. Steps:
 *   1. Load delivery + endpoint + event.
 *   2. Skip if delivery already terminal (SUCCEEDED / DEAD_LETTERED).
 *   3. Decrypt HMAC secret.
 *   4. Build canonical payload + sign with `inmolink-signature` header.
 *   5. POST with 10s timeout.
 *   6. Persist WebhookDeliveryAttempt.
 *   7. On 2xx → SUCCEEDED. On 4xx (non-429) → FAILED + DEAD_LETTERED
 *      since the endpoint owner needs to fix; retries won't help.
 *      Otherwise schedule next attempt per the back-off ladder.
 *   8. After the final attempt → DEAD_LETTERED.
 *
 * Retry ladder (PLAN §10): 1m → 5m → 30m → 2h → 12h → DEAD_LETTERED.
 */

type Args = {
  encryptionKey: string;
  logger: pino.Logger;
};

const RETRY_DELAYS_MS: ReadonlyArray<number> = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 3600_000, // 2 h
  12 * 3600_000, // 12 h
];

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function makeWebhookDeliverProcessor(opts: Args): Processor {
  return async function webhookDeliverProcessor(job: Job): Promise<void> {
    const { deliveryId } = job.data as { deliveryId: string };

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        event: { select: { id: true, type: true, payload: true, createdAt: true } },
        endpoint: {
          select: { id: true, url: true, secretEnc: true, isActive: true, agencyId: true },
        },
      },
    });
    if (!delivery) {
      opts.logger.warn({ deliveryId }, "delivery not found");
      return;
    }
    if (delivery.status === "SUCCEEDED" || delivery.status === "DEAD_LETTERED") {
      return; // Idempotent — re-enqueue is a no-op.
    }
    if (!delivery.endpoint.isActive) {
      // Endpoint disabled while delivery was queued; abandon as DLQ.
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DEAD_LETTERED",
          deadLetteredAt: new Date(),
          errorMessage: "Endpoint disabled before delivery completed",
        },
      });
      return;
    }

    const key = Buffer.from(opts.encryptionKey, "hex");
    const secret = decryptFromString(delivery.endpoint.secretEnc, key);

    const body = JSON.stringify({
      id: delivery.event.id,
      type: delivery.event.type,
      created_at: delivery.event.createdAt.toISOString(),
      delivery_id: delivery.id,
      attempt: delivery.attemptCount + 1,
      payload: delivery.event.payload,
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const signatureHeader = `t=${timestamp},v1=${sig}`;

    const startedAt = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let succeeded = false;
    let permanentFailure = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(delivery.endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Inmolink-Webhooks/1.0",
            "inmolink-signature": signatureHeader,
            "inmolink-event-id": delivery.event.id,
            "inmolink-event-type": delivery.event.type,
            "inmolink-delivery-id": delivery.id,
          },
          body,
          signal: controller.signal,
        });
        responseStatus = res.status;
        // Truncate response body for storage; we cap the column at 2000 chars.
        try {
          responseBody = (await res.text()).slice(0, 2000);
        } catch {
          responseBody = null;
        }
        succeeded = res.status >= 200 && res.status < 300;
        // 4xx (excluding 408 / 429) — endpoint says "no" definitively.
        permanentFailure =
          res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "fetch failed";
      opts.logger.warn({ err: errorMessage, deliveryId }, "webhook fetch failed");
    }
    const durationMs = Date.now() - startedAt;

    const attemptIndex = delivery.attemptCount; // 0-based: this is the (n+1)th attempt
    const isLastAttempt = attemptIndex + 1 >= MAX_ATTEMPTS;

    let nextStatus: "SUCCEEDED" | "FAILED" | "DEAD_LETTERED" | "PENDING";
    let nextAttemptAt: Date | null = null;

    if (succeeded) {
      nextStatus = "SUCCEEDED";
    } else if (permanentFailure) {
      nextStatus = "DEAD_LETTERED";
    } else if (isLastAttempt) {
      nextStatus = "DEAD_LETTERED";
    } else {
      nextStatus = "PENDING";
      const delayMs = RETRY_DELAYS_MS[attemptIndex] ?? RETRY_DELAYS_MS.at(-1) ?? 60_000;
      nextAttemptAt = new Date(Date.now() + delayMs);
    }

    await prisma.$transaction([
      prisma.webhookDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptedAt: new Date(),
          responseStatus,
          responseBodyTrunc: responseBody,
          errorMessage,
          durationMs,
        },
      }),
      prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status:
            nextStatus === "SUCCEEDED"
              ? "SUCCEEDED"
              : nextStatus === "PENDING"
                ? "PENDING"
                : nextStatus,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          nextAttemptAt,
          succeededAt: nextStatus === "SUCCEEDED" ? new Date() : null,
          deadLetteredAt: nextStatus === "DEAD_LETTERED" ? new Date() : null,
          responseStatus,
          errorMessage: errorMessage ?? (succeeded ? null : `HTTP ${responseStatus ?? "ERR"}`),
        },
      }),
    ]);

    opts.logger.info(
      {
        deliveryId,
        status: nextStatus,
        responseStatus,
        attempt: attemptIndex + 1,
      },
      "webhook delivery attempt complete",
    );
  };
}

// re-export for the dispatcher to use the same constant
export { RETRY_DELAYS_MS };
