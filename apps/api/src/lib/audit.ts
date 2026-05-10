import { prisma } from "@inmolink/db";
import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";

/**
 * Audit log writer (PLAN §9.4 / §11.12). All security-sensitive actions
 * funnel through here so we have one consistent write site.
 *
 * Soft-fail: AuditLog write failures must NOT break the user action. The
 * helper logs and swallows so e.g. a transient DB hiccup on the audit row
 * doesn't mask a successful login.
 *
 * Actor IP / UA captured from the request when available. `trustProxy: true`
 * is set on Fastify (see app.ts) so `request.ip` already honors X-Forwarded-For.
 */

export type AuditEventType = Prisma.AuditLogCreateInput["type"];

type WriteArgs = {
  type: AuditEventType;
  request?: FastifyRequest;
  actorUserId?: string | null;
  agencyId?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(args: WriteArgs): Promise<void> {
  const ip = args.request?.ip ?? null;
  const ua = args.request?.headers["user-agent"] ?? null;

  try {
    await prisma.auditLog.create({
      data: {
        type: args.type,
        actorUserId: args.actorUserId ?? null,
        actorIp: ip,
        actorUa: typeof ua === "string" ? ua.slice(0, 500) : null,
        agencyId: args.agencyId ?? null,
        targetKind: args.targetKind ?? null,
        targetId: args.targetId ?? null,
        metadata: args.metadata,
      },
    });
  } catch (err) {
    args.request?.log.warn({ err, type: args.type }, "audit log write failed");
  }
}

/**
 * Transactional variant — used inside `prisma.$transaction` so the audit
 * row commits atomically with the entity change. Throws on failure (the
 * caller is in a transaction; rolling back is the correct behavior).
 */
export async function writeAuditLogTx(
  tx: Prisma.TransactionClient,
  args: Omit<WriteArgs, "request"> & { actorIp?: string | null; actorUa?: string | null },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      type: args.type,
      actorUserId: args.actorUserId ?? null,
      actorIp: args.actorIp ?? null,
      actorUa: args.actorUa?.slice(0, 500) ?? null,
      agencyId: args.agencyId ?? null,
      targetKind: args.targetKind ?? null,
      targetId: args.targetId ?? null,
      metadata: args.metadata,
    },
  });
}
