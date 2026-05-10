import { randomBytes } from "node:crypto";
import { decryptFromString, encryptToString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { webhookSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "Not allowed") {
    super(message);
  }
}
export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Not found") {
    super(message);
  }
}

function resolveAgencyId(user: AuthenticatedUser, queryAgencyId?: string): string {
  if (user.role === "SUPER_ADMIN") {
    const id = queryAgencyId ?? user.agencyId;
    if (!id) throw new ForbiddenError("Provide ?agencyId= when super-admin has no home agency");
    return id;
  }
  if (user.role !== "AGENCY_ADMIN") throw new ForbiddenError("AGENCY_ADMIN role required");
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  if (queryAgencyId && queryAgencyId !== user.agencyId) {
    throw new ForbiddenError("Cannot manage another agency's webhooks");
  }
  return user.agencyId;
}

function toOutput(row: {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  secretEnc: string;
  createdAt: Date;
  updatedAt: Date;
}): webhookSchemas.WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    events: row.events as webhookSchemas.WebhookEventType[],
    isActive: row.isActive,
    description: row.description,
    hasSecret: row.secretEnc.length > 0,
    secretSuffix: row.secretEnc.length > 0 ? row.secretEnc.slice(-4) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEndpoints(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<webhookSchemas.WebhookEndpoint[]> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const rows = await prisma.webhookEndpoint.findMany({
    where: { agencyId },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(toOutput);
}

export async function createEndpoint(
  user: AuthenticatedUser,
  input: webhookSchemas.WebhookEndpointInput,
  encryptionKeyHex: string,
  queryAgencyId: string | undefined,
): Promise<{ endpoint: webhookSchemas.WebhookEndpoint; secret: string }> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  // Auto-generate when caller doesn't supply one. 32 bytes hex (256 bits).
  const secret = input.secret ?? randomBytes(32).toString("hex");
  const key = Buffer.from(encryptionKeyHex, "hex");
  const row = await prisma.webhookEndpoint.create({
    data: {
      agencyId,
      url: input.url,
      events: input.events,
      isActive: input.isActive,
      description: input.description ?? null,
      secretEnc: encryptToString(secret, key),
    },
  });
  return { endpoint: toOutput(row), secret };
}

export async function updateEndpoint(
  user: AuthenticatedUser,
  id: string,
  input: webhookSchemas.WebhookEndpointInput,
  encryptionKeyHex: string,
  queryAgencyId: string | undefined,
): Promise<webhookSchemas.WebhookEndpoint> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id, agencyId },
  });
  if (!existing) throw new NotFoundError("Endpoint not found");
  const data: Prisma.WebhookEndpointUpdateInput = {
    url: input.url,
    events: input.events,
    isActive: input.isActive,
    description: input.description ?? null,
  };
  if (input.secret !== undefined) {
    const key = Buffer.from(encryptionKeyHex, "hex");
    data.secretEnc = encryptToString(input.secret, key);
  }
  const row = await prisma.webhookEndpoint.update({ where: { id }, data });
  return toOutput(row);
}

export async function deleteEndpoint(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.webhookEndpoint.deleteMany({ where: { id, agencyId } });
  if (r.count === 0) throw new NotFoundError("Endpoint not found");
}

/**
 * Enqueue a synthetic test event for a single endpoint. Materializes
 * `WebhookEvent` + `WebhookDelivery(PENDING)` for that endpoint only;
 * dispatcher picks it up like any normal delivery.
 */
export async function emitTestEvent(
  user: AuthenticatedUser,
  id: string,
  eventType: import("@inmolink/shared").webhookSchemas.WebhookEventType,
  queryAgencyId: string | undefined,
): Promise<{ deliveryId: string }> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, agencyId },
    select: { id: true },
  });
  if (!endpoint) throw new NotFoundError("Endpoint not found");

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.webhookEvent.create({
      data: {
        type: eventType,
        agencyId,
        payload: { test: true, timestamp: new Date().toISOString() },
      },
      select: { id: true },
    });
    const delivery = await tx.webhookDelivery.create({
      data: {
        eventId: event.id,
        endpointId: endpoint.id,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });
    return { deliveryId: delivery.id };
  });
  return result;
}

/** Decrypt secret for the worker (only callable inside the api process). */
export async function getDecryptedSecret(
  endpointId: string,
  encryptionKeyHex: string,
): Promise<string | null> {
  const row = await prisma.webhookEndpoint.findUnique({
    where: { id: endpointId },
    select: { secretEnc: true },
  });
  if (!row) return null;
  const key = Buffer.from(encryptionKeyHex, "hex");
  return decryptFromString(row.secretEnc, key);
}
