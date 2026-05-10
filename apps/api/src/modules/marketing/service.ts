import { decryptFromString, encryptToString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { marketingSchemas } from "@inmolink/shared";
import { Prisma } from "@prisma/client";
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
export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
  constructor(message = "Conflict") {
    super(message);
  }
}

/**
 * Resolve the agency the caller is allowed to act on.
 * - SUPER_ADMIN: explicit `?agencyId=` or own; otherwise 403.
 * - AGENCY_ADMIN: own only.
 * - AGENT: blocked (marketing is admin-only).
 */
export function resolveAgencyId(user: AuthenticatedUser, queryAgencyId?: string): string {
  if (user.role === "SUPER_ADMIN") {
    const id = queryAgencyId ?? user.agencyId;
    if (!id) throw new ForbiddenError("Provide ?agencyId= when super-admin has no home agency");
    return id;
  }
  if (user.role !== "AGENCY_ADMIN") throw new ForbiddenError("AGENCY_ADMIN role required");
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  if (queryAgencyId && queryAgencyId !== user.agencyId) {
    throw new ForbiddenError("Cannot manage another agency's marketing");
  }
  return user.agencyId;
}

// ====== AgencyEmailConfig ======

function toConfigOutput(
  agencyId: string,
  row: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPasswordEnc: string;
    smtpSecure: boolean;
    fromEmail: string;
    fromName: string;
    dkimDomain: string | null;
    dkimSelector: string | null;
    dkimPrivateKeyEnc: string | null;
    testStatus: string | null;
    testedAt: Date | null;
  },
): marketingSchemas.EmailConfigOutput {
  return {
    agencyId,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpSecure: row.smtpSecure,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    hasPassword: row.smtpPasswordEnc.length > 0,
    hasDkimKey: Boolean(row.dkimPrivateKeyEnc),
    dkimDomain: row.dkimDomain,
    dkimSelector: row.dkimSelector,
    testStatus: row.testStatus,
    testedAt: row.testedAt?.toISOString() ?? null,
  };
}

export async function getEmailConfig(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailConfigOutput | null> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const row = await prisma.agencyEmailConfig.findUnique({ where: { agencyId } });
  if (!row) return null;
  return toConfigOutput(agencyId, row);
}

export async function upsertEmailConfig(
  user: AuthenticatedUser,
  input: marketingSchemas.EmailConfigInput,
  encryptionKeyHex: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailConfigOutput> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const key = Buffer.from(encryptionKeyHex, "hex");

  const existing = await prisma.agencyEmailConfig.findUnique({ where: { agencyId } });

  // Password is omitted on update when caller doesn't want to rotate it —
  // we keep the existing encrypted value. Same for DKIM private key.
  const smtpPasswordEnc =
    input.smtpPassword !== undefined && input.smtpPassword !== null
      ? encryptToString(input.smtpPassword, key)
      : (existing?.smtpPasswordEnc ?? "");
  const dkimPrivateKeyEnc = input.dkimPrivateKey
    ? encryptToString(input.dkimPrivateKey, key)
    : input.dkimPrivateKey === null
      ? null
      : (existing?.dkimPrivateKeyEnc ?? null);

  if (!smtpPasswordEnc) {
    throw new ForbiddenError("smtpPassword required on first save");
  }

  const row = await prisma.agencyEmailConfig.upsert({
    where: { agencyId },
    create: {
      agencyId,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser,
      smtpPasswordEnc,
      smtpSecure: input.smtpSecure,
      fromEmail: input.fromEmail,
      fromName: input.fromName,
      dkimDomain: input.dkimDomain ?? null,
      dkimSelector: input.dkimSelector ?? null,
      dkimPrivateKeyEnc,
      testStatus: "NOT_TESTED",
    },
    update: {
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser,
      smtpPasswordEnc,
      smtpSecure: input.smtpSecure,
      fromEmail: input.fromEmail,
      fromName: input.fromName,
      dkimDomain: input.dkimDomain ?? null,
      dkimSelector: input.dkimSelector ?? null,
      dkimPrivateKeyEnc,
      testStatus: "NOT_TESTED",
      testedAt: null,
    },
  });
  return toConfigOutput(agencyId, row);
}

export async function deleteEmailConfig(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  await prisma.agencyEmailConfig.deleteMany({ where: { agencyId } });
}

/**
 * Decrypt SMTP creds for the per-agency send transport. Used by api
 * test-send + worker EMAIL_SEND processor.
 */
export async function getDecryptedConfig(
  agencyId: string,
  encryptionKeyHex: string,
): Promise<{
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
  dkimDomain: string | null;
  dkimSelector: string | null;
  dkimPrivateKey: string | null;
} | null> {
  const row = await prisma.agencyEmailConfig.findUnique({ where: { agencyId } });
  if (!row) return null;
  const key = Buffer.from(encryptionKeyHex, "hex");
  return {
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpPassword: decryptFromString(row.smtpPasswordEnc, key),
    smtpSecure: row.smtpSecure,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    dkimDomain: row.dkimDomain,
    dkimSelector: row.dkimSelector,
    dkimPrivateKey: row.dkimPrivateKeyEnc ? decryptFromString(row.dkimPrivateKeyEnc, key) : null,
  };
}

// ====== EmailTemplate ======

export async function listTemplates(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailTemplate[]> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const rows = await prisma.emailTemplate.findMany({
    where: { agencyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getTemplate(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailTemplate> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailTemplate.findFirst({ where: { id, agencyId } });
  if (!r) throw new NotFoundError("Template not found");
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createTemplate(
  user: AuthenticatedUser,
  input: marketingSchemas.EmailTemplateInput,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailTemplate> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailTemplate.create({
    data: { agencyId, ...input, bodyText: input.bodyText ?? null },
  });
  return getTemplate(user, r.id, queryAgencyId);
}

export async function updateTemplate(
  user: AuthenticatedUser,
  id: string,
  input: marketingSchemas.EmailTemplateInput,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailTemplate> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailTemplate.updateMany({
    where: { id, agencyId },
    data: { ...input, bodyText: input.bodyText ?? null },
  });
  if (r.count === 0) throw new NotFoundError("Template not found");
  return getTemplate(user, id, queryAgencyId);
}

export async function deleteTemplate(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailTemplate.deleteMany({ where: { id, agencyId } });
  if (r.count === 0) throw new NotFoundError("Template not found");
}

// ====== EmailSuppression ======

export async function addSuppression(
  user: AuthenticatedUser,
  input: marketingSchemas.SuppressionInput,
  queryAgencyId: string | undefined,
): Promise<{ id: string }> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  try {
    const r = await prisma.emailSuppression.create({
      data: {
        agencyId,
        email: input.email,
        reason: input.reason,
        notes: input.notes ?? null,
      },
    });
    return { id: r.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("Email already suppressed");
    }
    throw err;
  }
}

export async function removeSuppression(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailSuppression.deleteMany({ where: { id, agencyId } });
  if (r.count === 0) throw new NotFoundError("Suppression not found");
}

export async function listSuppressions(
  user: AuthenticatedUser,
  query: { cursor?: string; limit?: number; q?: string },
  queryAgencyId: string | undefined,
) {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const decoded = decodeCursor(query.cursor);

  const where: Prisma.EmailSuppressionWhereInput = { agencyId };
  if (query.q) where.email = { contains: query.q, mode: "insensitive" };
  if (decoded) {
    where.OR = [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
    ];
  }

  const rows = await prisma.emailSuppression.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  return {
    items: slice.map((r) => ({
      id: r.id,
      email: r.email,
      reason: r.reason as marketingSchemas.SuppressionReason,
      bounceType: r.bounceType,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null,
  };
}

// ====== Contact ======

export async function listContacts(
  user: AuthenticatedUser,
  query: { cursor?: string; limit?: number; q?: string; tag?: string },
  queryAgencyId: string | undefined,
) {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const decoded = decodeCursor(query.cursor);

  const where: Prisma.ContactWhereInput = { agencyId };
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: "insensitive" } },
      { firstName: { contains: query.q, mode: "insensitive" } },
      { lastName: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.tag) where.tags = { has: query.tag };
  if (decoded) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const rows = await prisma.contact.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  return {
    items: slice.map(toContactOut),
    nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null,
  };
}

export async function createContact(
  user: AuthenticatedUser,
  input: marketingSchemas.ContactInput,
  queryAgencyId: string | undefined,
) {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  try {
    const r = await prisma.contact.create({
      data: {
        agencyId,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        phone: input.phone ?? null,
        tags: input.tags ?? [],
        source: input.source,
        notes: input.notes ?? null,
        consentGivenAt: input.consentGiven ? new Date() : null,
      },
    });
    return toContactOut(r);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("Contact with this email already exists");
    }
    throw err;
  }
}

export async function updateContact(
  user: AuthenticatedUser,
  id: string,
  input: marketingSchemas.ContactInput,
  queryAgencyId: string | undefined,
) {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.contact.updateMany({
    where: { id, agencyId },
    data: {
      email: input.email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      tags: input.tags ?? [],
      source: input.source,
      notes: input.notes ?? null,
      consentGivenAt: input.consentGiven ? new Date() : null,
    },
  });
  if (r.count === 0) throw new NotFoundError("Contact not found");
  const row = await prisma.contact.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Contact not found");
  return toContactOut(row);
}

export async function deleteContact(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.contact.deleteMany({ where: { id, agencyId } });
  if (r.count === 0) throw new NotFoundError("Contact not found");
}

export async function bulkUpsertContacts(
  user: AuthenticatedUser,
  input: marketingSchemas.ContactInput[],
  queryAgencyId: string | undefined,
): Promise<{ created: number; updated: number }> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  let created = 0;
  let updated = 0;
  // Upserts run sequentially in a transaction so the counts are accurate
  // and a single bad row doesn't half-import.
  await prisma.$transaction(async (tx) => {
    for (const c of input) {
      const result = await tx.contact.upsert({
        where: { agencyId_email: { agencyId, email: c.email } },
        create: {
          agencyId,
          email: c.email,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          phone: c.phone ?? null,
          tags: c.tags ?? [],
          source: c.source,
          notes: c.notes ?? null,
          consentGivenAt: c.consentGiven ? new Date() : null,
        },
        update: {
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          phone: c.phone ?? null,
          tags: c.tags ?? [],
          notes: c.notes ?? null,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created += 1;
      } else {
        updated += 1;
      }
    }
  });
  return { created, updated };
}

function toContactOut(r: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  tags: string[];
  source: string | null;
  notes: string | null;
  consentGivenAt: Date | null;
  unsubscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    tags: r.tags,
    source: r.source,
    notes: r.notes,
    consentGivenAt: r.consentGivenAt?.toISOString() ?? null,
    unsubscribedAt: r.unsubscribedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ====== Cursor helpers ======

export function encodeCursor(c: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: c.createdAt.toISOString(), id: c.id })).toString(
    "base64url",
  );
}

export function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
