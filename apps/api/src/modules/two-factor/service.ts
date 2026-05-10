import {
  decodeSecret,
  decryptFromString,
  encryptToString,
  generateRecoveryCodes,
  generateSecret,
  hashPassword,
  otpauthUrl,
  verifyCode,
  verifyPassword,
} from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { twoFactorSchemas } from "@inmolink/shared";
import type { Env } from "../../config";
import type { AuthenticatedUser } from "../../plugins/auth";

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}
export class IncorrectPasswordError extends Error {
  readonly statusCode = 401;
  readonly code = "INCORRECT_PASSWORD";
  constructor() {
    super("Current password is incorrect");
  }
}
export class IncorrectCodeError extends Error {
  readonly statusCode = 400;
  readonly code = "INCORRECT_CODE";
  constructor() {
    super("Code is incorrect or expired");
  }
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

const ISSUER = "Inmolink";

type RecoveryEntry = { hash: string; used: boolean };

function key(env: Env): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

/**
 * Step 1 — generate a fresh secret + otpauth URL. The secret is stored
 * AES-256-GCM-encrypted on UserSettings as "pending"; totpEnabledAt
 * stays null until /verify lands. Subsequent calls to /enroll regenerate
 * the secret (so users who lose their first attempt can restart).
 */
export async function startEnrollment(
  user: AuthenticatedUser,
  env: Env,
): Promise<twoFactorSchemas.TotpEnrollResponse> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { totpEnabledAt: true },
  });
  if (settings?.totpEnabledAt) {
    throw new ConflictError("Two-factor is already enabled — disable it first");
  }

  const secret = generateSecret();
  const enc = encryptToString(secret.base32, key(env));

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, totpSecretEnc: enc },
    update: { totpSecretEnc: enc },
  });

  return {
    secret: secret.base32,
    otpauthUrl: otpauthUrl({ secret, account: user.email, issuer: ISSUER }),
  };
}

/**
 * Step 2 — verify password + first code. On success enable 2FA + generate
 * 8 recovery codes (returned once, then stored Argon2-hashed).
 */
export async function completeEnrollment(
  user: AuthenticatedUser,
  input: twoFactorSchemas.TotpVerifyInput,
  env: Env,
): Promise<twoFactorSchemas.TotpVerifyResponse> {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      passwordHash: true,
      settings: { select: { totpSecretEnc: true, totpEnabledAt: true } },
    },
  });
  if (!u) throw new NotFoundError("User not found");
  if (!u.passwordHash) throw new IncorrectPasswordError();
  if (!u.settings?.totpSecretEnc || u.settings.totpEnabledAt) {
    throw new ConflictError("Start enrollment first");
  }

  const passwordOk = await verifyPassword(input.currentPassword, u.passwordHash);
  if (!passwordOk) throw new IncorrectPasswordError();

  const secret = decodeSecret(decryptFromString(u.settings.totpSecretEnc, key(env)));
  if (!verifyCode(secret, input.code)) throw new IncorrectCodeError();

  const recoveryCodes = generateRecoveryCodes(8);
  const entries: RecoveryEntry[] = [];
  for (const c of recoveryCodes) {
    entries.push({ hash: await hashPassword(c), used: false });
  }
  const recoveryEnc = encryptToString(JSON.stringify(entries), key(env));

  await prisma.userSettings.update({
    where: { userId: user.id },
    data: {
      totpEnabledAt: new Date(),
      totpRecoveryCodesEnc: recoveryEnc,
    },
  });

  return { enabled: true, recoveryCodes };
}

/**
 * Disable: requires password + (TOTP code OR recovery code). Wipes secret
 * + recovery codes + totpEnabledAt.
 */
export async function disableTwoFactor(
  user: AuthenticatedUser,
  input: twoFactorSchemas.TotpDisableInput,
  env: Env,
): Promise<{ disabled: true }> {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      passwordHash: true,
      settings: {
        select: {
          totpSecretEnc: true,
          totpEnabledAt: true,
          totpRecoveryCodesEnc: true,
        },
      },
    },
  });
  if (!u) throw new NotFoundError("User not found");
  if (!u.passwordHash) throw new IncorrectPasswordError();
  if (!u.settings?.totpEnabledAt || !u.settings.totpSecretEnc) {
    throw new ConflictError("Two-factor is not enabled");
  }

  const passwordOk = await verifyPassword(input.currentPassword, u.passwordHash);
  if (!passwordOk) throw new IncorrectPasswordError();

  let secondFactorOk = false;
  if (input.code) {
    const secret = decodeSecret(decryptFromString(u.settings.totpSecretEnc, key(env)));
    secondFactorOk = verifyCode(secret, input.code);
  } else if (input.recoveryCode && u.settings.totpRecoveryCodesEnc) {
    secondFactorOk = await verifyAndConsumeRecoveryCode(
      user.id,
      input.recoveryCode,
      u.settings.totpRecoveryCodesEnc,
      env,
      false, // don't persist consumed flag — we're about to wipe everything
    );
  }
  if (!secondFactorOk) throw new IncorrectCodeError();

  await prisma.userSettings.update({
    where: { userId: user.id },
    data: {
      totpEnabledAt: null,
      totpSecretEnc: null,
      totpRecoveryCodesEnc: null,
    },
  });
  return { disabled: true };
}

/**
 * Used by the sign-in flow (Credentials.authorize). Returns true if
 * `code` matches the stored secret OR a still-valid recovery code. When
 * a recovery code matches, it's marked used and persisted before we
 * return — the same code can never sign in twice.
 */
export async function verifyTwoFactorAtSignIn(
  userId: string,
  code: string,
  env: Env,
): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { totpSecretEnc: true, totpEnabledAt: true, totpRecoveryCodesEnc: true },
  });
  if (!settings?.totpEnabledAt || !settings.totpSecretEnc) return true; // no 2FA

  const cleaned = code.trim();
  if (/^\d{6}$/.test(cleaned)) {
    const secret = decodeSecret(decryptFromString(settings.totpSecretEnc, key(env)));
    return verifyCode(secret, cleaned);
  }
  if (/^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/.test(cleaned) && settings.totpRecoveryCodesEnc) {
    return verifyAndConsumeRecoveryCode(userId, cleaned, settings.totpRecoveryCodesEnc, env, true);
  }
  return false;
}

async function verifyAndConsumeRecoveryCode(
  userId: string,
  code: string,
  encBlob: string,
  env: Env,
  persist: boolean,
): Promise<boolean> {
  const json = decryptFromString(encBlob, key(env));
  const list: RecoveryEntry[] = JSON.parse(json);
  for (const entry of list) {
    if (entry.used) continue;
    const ok = await verifyPassword(code, entry.hash);
    if (ok) {
      if (persist) {
        entry.used = true;
        const reencrypted = encryptToString(JSON.stringify(list), key(env));
        await prisma.userSettings.update({
          where: { userId },
          data: { totpRecoveryCodesEnc: reencrypted },
        });
      }
      return true;
    }
  }
  return false;
}
