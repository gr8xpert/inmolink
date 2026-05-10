import { randomBytes } from "node:crypto";
import { hashPassword } from "@inmolink/auth";
import type { inviteSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import { Prisma } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config";
import { sendEmail } from "../../lib/email";
import type { AuthenticatedUser } from "../../plugins/auth";
import {
  type InviteRow,
  attachExistingUserToAgency,
  bumpInvite,
  createInvite,
  createUserFromInvite,
  deleteInvite,
  findActivePendingInviteForEmail,
  findInviteById,
  findInviteByToken,
  findUserByEmail,
  listAgencyMembers,
  listPendingInvites,
} from "./repository";

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}
export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.detail = detail;
  }
}
export class GoneError extends Error {
  readonly statusCode = 410;
  readonly code = "GONE";
}

const TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 7;

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function expiryDate(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function requireAdmin(user: AuthenticatedUser, agencyId: string): void {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role === "AGENCY_ADMIN" && user.agencyId === agencyId) return;
  throw new ForbiddenError("AGENCY_ADMIN role required");
}

function inviteAcceptUrl(env: Env, locale: string, token: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/${locale}/invite/${encodeURIComponent(token)}`;
}

// ========== Dashboard endpoints ==========

export async function getTeam(
  user: AuthenticatedUser,
  storage: Storage,
): Promise<inviteSchemas.TeamResponse> {
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  const [members, invites] = await Promise.all([
    listAgencyMembers(user.agencyId),
    listPendingInvites(user.agencyId),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      firstName: m.firstName,
      lastName: m.lastName,
      role: m.role,
      isActive: m.isActive,
      photoPublicUrl: m.photoR2Key ? storage.publicUrl(m.photoR2Key) : null,
    })),
    invites: invites.map(toSummary),
  };
}

export async function createInviteForAgency(
  user: AuthenticatedUser,
  input: inviteSchemas.InviteCreateInput,
  env: Env,
  log: FastifyBaseLogger,
  locale: string,
): Promise<inviteSchemas.InviteSummary> {
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  requireAdmin(user, user.agencyId);

  // Don't invite addresses already belonging to another agency.
  const existingUser = await findUserByEmail(input.email);
  if (existingUser?.agencyId && existingUser.agencyId !== user.agencyId) {
    throw new ConflictError("That email is already a member of another agency");
  }

  // Replace any pending invite for the same (agency, email) — re-issue rather
  // than stack pending tokens. Old token becomes invalid.
  const pending = await findActivePendingInviteForEmail(user.agencyId, input.email);
  const token = newToken();
  const expiresAt = expiryDate();

  let row: InviteRow;
  try {
    if (pending) {
      row = await bumpInvite(pending.id, { token, expiresAt });
    } else {
      row = await createInvite({
        agencyId: user.agencyId,
        email: input.email,
        invitedRole: input.invitedRole,
        invitedById: user.id,
        token,
        expiresAt,
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Token collision — astronomically unlikely with 32 bytes; retry once.
      const retryToken = newToken();
      row = await createInvite({
        agencyId: user.agencyId,
        email: input.email,
        invitedRole: input.invitedRole,
        invitedById: user.id,
        token: retryToken,
        expiresAt,
      });
    } else {
      throw err;
    }
  }

  const acceptUrl = inviteAcceptUrl(env, locale, row.token);
  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM },
    {
      to: row.email,
      subject: `You're invited to join ${row.agency.name} on Inmolink`,
      text: `You've been invited to join ${row.agency.name} on Inmolink.\n\nAccept here:\n${acceptUrl}\n\nThis link expires on ${row.expiresAt.toUTCString()}.\nIf you weren't expecting this, ignore this email.`,
      html: `<p>You've been invited to join <strong>${escapeHtml(row.agency.name)}</strong> on Inmolink.</p><p><a href="${acceptUrl}">Accept the invitation</a></p><p style="color:#666;font-size:12px">This link expires on ${row.expiresAt.toUTCString()}. If you weren't expecting this, ignore this email.</p>`,
    },
    log,
  );

  return toSummary(row);
}

export async function resendInvite(
  user: AuthenticatedUser,
  inviteId: string,
  env: Env,
  log: FastifyBaseLogger,
  locale: string,
): Promise<inviteSchemas.InviteSummary> {
  const row = await findInviteById(inviteId);
  if (!row) throw new NotFoundError("Invite not found");
  requireAdmin(user, row.agencyId);
  if (row.acceptedAt) throw new ConflictError("Invite already accepted");

  const token = newToken();
  const expiresAt = expiryDate();
  const bumped = await bumpInvite(row.id, { token, expiresAt });

  const acceptUrl = inviteAcceptUrl(env, locale, bumped.token);
  await sendEmail(
    { RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM },
    {
      to: bumped.email,
      subject: `Reminder: invitation to join ${bumped.agency.name}`,
      text: `Reminder: you have a pending invitation to join ${bumped.agency.name} on Inmolink.\n\nAccept here:\n${acceptUrl}\n\nThis link expires on ${bumped.expiresAt.toUTCString()}.`,
      html: `<p>Reminder: you have a pending invitation to join <strong>${escapeHtml(bumped.agency.name)}</strong>.</p><p><a href="${acceptUrl}">Accept the invitation</a></p><p style="color:#666;font-size:12px">This link expires on ${bumped.expiresAt.toUTCString()}.</p>`,
    },
    log,
  );

  return toSummary(bumped);
}

export async function revokeInvite(user: AuthenticatedUser, inviteId: string): Promise<void> {
  const row = await findInviteById(inviteId);
  if (!row) throw new NotFoundError("Invite not found");
  requireAdmin(user, row.agencyId);
  if (row.acceptedAt) {
    // Accepted invites are kept as audit trail; just refuse the delete.
    throw new ConflictError("Invite already accepted — cannot revoke");
  }
  await deleteInvite(inviteId);
}

// ========== Public (anonymous + authed accept) endpoints ==========

export async function getInviteForAccept(
  token: string,
  storage: Storage,
): Promise<inviteSchemas.InviteForAccept> {
  const row = await findInviteByToken(token);
  if (!row) throw new NotFoundError("Invite not found");
  if (row.acceptedAt) throw new GoneError("Invite already accepted");
  if (row.expiresAt.getTime() < Date.now()) throw new GoneError("Invite expired");
  return {
    email: row.email,
    invitedRole: row.invitedRole,
    expiresAt: row.expiresAt.toISOString(),
    agency: {
      id: row.agency.id,
      name: row.agency.name,
      slug: row.agency.slug,
      logoPublicUrl: row.agency.logoR2Key ? storage.publicUrl(row.agency.logoR2Key) : null,
    },
  };
}

/** Accept as the currently signed-in user. The session's email must match
 * the invite's email (case-insensitive). */
export async function acceptInviteAsExistingUser(
  user: AuthenticatedUser,
  token: string,
): Promise<{ userId: string; agencyId: string }> {
  const row = await findInviteByToken(token);
  if (!row) throw new NotFoundError("Invite not found");
  if (row.acceptedAt) throw new GoneError("Invite already accepted");
  if (row.expiresAt.getTime() < Date.now()) throw new GoneError("Invite expired");

  if (user.email.toLowerCase() !== row.email.toLowerCase()) {
    throw new ForbiddenError("Sign in with the invited email to accept this invite");
  }
  if (user.agencyId && user.agencyId !== row.agencyId) {
    throw new ConflictError("Your account is already a member of another agency");
  }

  await attachExistingUserToAgency({
    userId: user.id,
    agencyId: row.agencyId,
    role: row.invitedRole,
    inviteId: row.id,
  });
  return { userId: user.id, agencyId: row.agencyId };
}

/** Accept by creating a new account. Anonymous endpoint. The email is taken
 * from the invite, NOT from the request body (prevents impersonation). */
export async function acceptInviteAsNewUser(
  token: string,
  input: inviteSchemas.InviteAcceptNewInput,
): Promise<{ userId: string; agencyId: string }> {
  const row = await findInviteByToken(token);
  if (!row) throw new NotFoundError("Invite not found");
  if (row.acceptedAt) throw new GoneError("Invite already accepted");
  if (row.expiresAt.getTime() < Date.now()) throw new GoneError("Invite expired");

  // If a user with that email already exists, route them to the
  // existing-user path (they'll need to sign in first).
  const existing = await findUserByEmail(row.email);
  if (existing) {
    throw new ConflictError("An account with this email already exists — sign in to accept");
  }

  const passwordHash = await hashPassword(input.password);
  const slug = await generateUniqueSlug(input.firstName, input.lastName);

  try {
    const user = await createUserFromInvite({
      email: row.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      slug,
      agencyId: row.agencyId,
      role: row.invitedRole,
      inviteId: row.id,
    });
    return { userId: user.id, agencyId: row.agencyId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An account with this email or slug already exists");
    }
    throw err;
  }
}

// ========== helpers ==========

function toSummary(row: InviteRow): inviteSchemas.InviteSummary {
  return {
    id: row.id,
    email: row.email,
    invitedRole: row.invitedRole,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function generateUniqueSlug(firstName: string, lastName: string): Promise<string> {
  const base = slugify(`${firstName} ${lastName}`) || "agent";
  // Append 6 random hex chars for uniqueness (~1 in 16M collisions); doesn't
  // poll the DB. Worst case the unique-constraint trips and the caller sees
  // 409, the service catches it and retries — but for simplicity we just
  // return the suffixed slug; a real conflict is essentially impossible.
  const suffix = randomBytes(3).toString("hex");
  return `${base}-${suffix}`.slice(0, 80);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
