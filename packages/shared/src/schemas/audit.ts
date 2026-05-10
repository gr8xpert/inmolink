import { z } from "zod";

/** Sprint 9. AuditLog viewer (super-admin only). */

export const auditEventTypeSchema = z.enum([
  "USER_LOGIN",
  "USER_LOGOUT",
  "PASSWORD_CHANGED",
  "TOTP_ENABLED",
  "TOTP_DISABLED",
  "ROLE_CHANGED",
  "EMAIL_VERIFIED",
  "PLAN_CHANGED",
  "PLAN_GRANTED_MANUALLY",
  "PLAN_REVOKED",
  "PROPERTY_DELETED",
  "PROPERTY_HARD_DELETED",
  "AGENCY_CREATED",
  "AGENCY_SUSPENDED",
  "AGENCY_REACTIVATED",
  "DEAL_DISPUTED",
  "DEAL_DISPUTE_RESOLVED",
  "IMPORT_CREDENTIALS_UPDATED",
  "WEBHOOK_REPLAYED",
  "SUPER_ADMIN_BULK_OPERATION",
  "SUPER_ADMIN_IMPERSONATE_START",
  "SUPER_ADMIN_IMPERSONATE_END",
]);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditLogRowSchema = z.object({
  id: z.string(),
  type: auditEventTypeSchema,
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorIp: z.string().nullable(),
  actorUa: z.string().nullable(),
  agencyId: z.string().nullable(),
  agencyName: z.string().nullable(),
  targetKind: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditLogRow = z.infer<typeof auditLogRowSchema>;

export const auditLogListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  type: auditEventTypeSchema.optional(),
  actorEmail: z.string().optional(),
  agencyId: z.string().optional(),
  targetKind: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export const auditLogListResponseSchema = z.object({
  items: z.array(auditLogRowSchema),
  nextCursor: z.string().nullable(),
});
