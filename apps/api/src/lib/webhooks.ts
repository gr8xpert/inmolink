import { prisma } from "@inmolink/db";
import type { webhookSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";

/**
 * Emit a webhook event (PLAN §11.10).
 *
 * Writes a single `WebhookEvent` row plus one `WebhookDelivery(PENDING)`
 * row per matching active endpoint, atomically inside the caller's
 * transaction. The worker's WEBHOOK_DISPATCHER picks up PENDING rows on
 * its tick and enqueues each one for delivery.
 *
 * Soft-fail when no endpoints subscribe — the emit succeeds silently. We
 * still write the WebhookEvent because it's a useful audit trail and
 * costs almost nothing.
 *
 * Caller MUST pass the same `tx` they used for the entity write so the
 * outbox is atomic with the change. If the entity write rolls back, no
 * webhook fires (the WebhookEvent row goes with it).
 */
export async function emitWebhookEvent(
  tx: Prisma.TransactionClient,
  args: {
    type: webhookSchemas.WebhookEventType;
    agencyId: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<void> {
  const endpoints = await tx.webhookEndpoint.findMany({
    where: {
      agencyId: args.agencyId,
      isActive: true,
      events: { has: args.type },
    },
    select: { id: true },
  });

  const event = await tx.webhookEvent.create({
    data: { type: args.type, agencyId: args.agencyId, payload: args.payload },
    select: { id: true },
  });

  if (endpoints.length === 0) return;

  await tx.webhookDelivery.createMany({
    data: endpoints.map((e) => ({
      eventId: event.id,
      endpointId: e.id,
      status: "PENDING" as const,
      nextAttemptAt: new Date(),
    })),
  });
}

/**
 * Variant for callers that aren't already inside a transaction. Wraps in
 * a one-shot `prisma.$transaction` so the helper always behaves the same.
 */
export async function emitWebhookEventStandalone(args: {
  type: webhookSchemas.WebhookEventType;
  agencyId: string;
  payload: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.$transaction(async (tx) => emitWebhookEvent(tx, args));
}
