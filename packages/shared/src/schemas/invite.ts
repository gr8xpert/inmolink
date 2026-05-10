import { z } from "zod";
import { userRoleSchema } from "../permissions";

/**
 * Wire-format schemas for the agency-invite flow (Sprint 4.C).
 *
 * Two acceptance modes:
 *   - new account: `acceptNewSchema` — no session; create User + attach.
 *   - existing user: `acceptExistingSchema` — empty body; the authed user's
 *     email must match the invited email.
 *
 * Token presented as a path parameter. Do NOT validate length here — the
 * server controls token shape; clients only echo it.
 */

export const inviteCreateSchema = z.object({
  email: z.string().email().toLowerCase(),
  invitedRole: userRoleSchema.default("AGENT"),
});

export const inviteAcceptNewSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: z.string().min(12).max(200),
});

export const inviteSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  invitedRole: userRoleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/** Anonymous accept-page payload — minimal disclosure: enough to render the
 * "Join {agencyName}" page without leaking other invite metadata. */
export const inviteForAcceptSchema = z.object({
  email: z.string(),
  invitedRole: userRoleSchema,
  expiresAt: z.string().datetime(),
  agency: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    logoPublicUrl: z.string().nullable(),
  }),
});

export const inviteListResponseSchema = z.object({
  items: z.array(inviteSummarySchema),
});

export const memberSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  photoPublicUrl: z.string().nullable(),
});

export const teamResponseSchema = z.object({
  members: z.array(memberSummarySchema),
  invites: z.array(inviteSummarySchema),
});

export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type InviteAcceptNewInput = z.infer<typeof inviteAcceptNewSchema>;
export type InviteSummary = z.infer<typeof inviteSummarySchema>;
export type InviteForAccept = z.infer<typeof inviteForAcceptSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type TeamResponse = z.infer<typeof teamResponseSchema>;
