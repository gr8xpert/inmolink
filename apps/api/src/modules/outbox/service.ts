import type { prisma } from "@inmolink/db";
import { outboxSchemas } from "@inmolink/shared";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Outbox emitter — call from inside a Prisma transaction so the OutboxEvent
 * row is guaranteed-or-rolled-back with the source mutation (PLAN §11.5
 * outbox pattern: "DB writes also write OutboxEvent; worker drains it →
 * Meilisearch. Survives Meilisearch downtime, no lost updates.").
 *
 * The worker (apps/worker) processes PENDING rows in a separate process;
 * see `processors/outbox-drain` and the `OUTBOX_DRAIN` queue scheduler.
 *
 * Usage:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const created = await tx.property.create({ ... });
 *     await emitSearchPropertyUpsert(tx, { propertyId: created.id, reason: "create" });
 *     return created;
 *   });
 */

type TxOrPrisma = Prisma.TransactionClient | PrismaClient | typeof prisma;

export async function emitSearchPropertyUpsert(
  tx: TxOrPrisma,
  payload: outboxSchemas.SearchPropertyUpsertPayloadInput,
): Promise<void> {
  const parsed = outboxSchemas.SearchPropertyUpsertPayload.parse(payload);
  await tx.outboxEvent.create({
    data: {
      topic: outboxSchemas.SEARCH_PROPERTY_UPSERT,
      payload: parsed as Prisma.InputJsonValue,
    },
  });
}

export async function emitSearchPropertyDelete(
  tx: TxOrPrisma,
  payload: outboxSchemas.SearchPropertyDeletePayloadInput,
): Promise<void> {
  const parsed = outboxSchemas.SearchPropertyDeletePayload.parse(payload);
  await tx.outboxEvent.create({
    data: {
      topic: outboxSchemas.SEARCH_PROPERTY_DELETE,
      payload: parsed as Prisma.InputJsonValue,
    },
  });
}
