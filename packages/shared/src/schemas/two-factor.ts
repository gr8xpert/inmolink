import { z } from "zod";

/**
 * 2FA / TOTP schemas (Sprint 4.E).
 *
 * Enrollment is two-step:
 *   1. POST /enroll → server returns secret (base32) + otpauth URL. The
 *      user adds it to their authenticator. Secret stored in UserSettings
 *      AES-256-GCM-encrypted; totpEnabledAt remains null.
 *   2. POST /verify with current password + 6-digit code. On success,
 *      totpEnabledAt = now() and 8 recovery codes are returned (only
 *      surfaced once — server hashes them).
 *
 * Disable: POST /disable with current password + 6-digit code OR a
 *   recovery code. Either second-factor is sufficient.
 */

const sixDigit = z.string().regex(/^\d{6}$/, "6-digit code only");
const recoveryCode = z.string().regex(/^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/);

export const totpEnrollResponseSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().min(1),
});

export const totpVerifySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  code: sixDigit,
});

export const totpVerifyResponseSchema = z.object({
  enabled: z.literal(true),
  recoveryCodes: z.array(recoveryCode).length(8),
});

export const totpDisableSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    code: sixDigit.optional(),
    recoveryCode: recoveryCode.optional(),
  })
  .refine((v) => Boolean(v.code) || Boolean(v.recoveryCode), {
    message: "Provide a TOTP code or a recovery code",
    path: ["code"],
  });

export type TotpEnrollResponse = z.infer<typeof totpEnrollResponseSchema>;
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;
export type TotpVerifyResponse = z.infer<typeof totpVerifyResponseSchema>;
export type TotpDisableInput = z.infer<typeof totpDisableSchema>;
