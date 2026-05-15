import { prisma } from "@inmolink/db";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { decryptFromString } from "./crypto";
import { hashPassword, verifyPassword } from "./password";
import { decodeSecret, verifyCode } from "./totp";

/**
 * Full Auth.js config — extends edge-safe authConfig with the Credentials
 * provider's authorize callback (which needs Prisma + Argon2). Used by the
 * route handler at apps/web/app/api/auth/[...nextauth]/route.ts and by
 * Server Components / Server Actions.
 *
 * Edge runtime (middleware) imports from `./edge.js` instead.
 *
 * Two-factor: when UserSettings.totpEnabledAt is set, sign-in requires a
 * second factor via the optional `totpCode` field. Missing code → throws
 * `TotpRequired` (the sign-in page swaps to the 2FA step). Invalid code →
 * `TotpInvalid`. Recovery codes (xxxx-xxxx-xxxx) consume on use.
 */

class TotpRequired extends CredentialsSignin {
  override code = "totp_required";
}
class TotpInvalid extends CredentialsSignin {
  override code = "totp_invalid";
}

export { TotpRequired, TotpInvalid };

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Two-factor code", type: "text" },
      },
      async authorize(rawCreds) {
        const parsed = credentialsSchema.safeParse(rawCreds);
        if (!parsed.success) return null;

        const { email, password, totpCode } = parsed.data;

        // Best-effort throttle: stop hammering a single email before we even
        // hit the DB. Counter lives in Redis when available; otherwise the
        // gate is a no-op (dev) and the next layer in front of the api
        // (nginx rate limit) takes the load.
        const throttled = await checkAndRecordLoginAttempt(email);
        if (throttled) {
          await writeAuditLogin(null, email, "FAILED_THROTTLED");
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            settings: {
              select: {
                totpEnabledAt: true,
                totpSecretEnc: true,
                totpRecoveryCodesEnc: true,
              },
            },
          },
        });

        if (!user) {
          await writeAuditLogin(null, email, "FAILED_UNKNOWN_USER");
          return null;
        }
        if (!user.isActive) {
          await writeAuditLogin(user.id, email, "FAILED_INACTIVE");
          return null;
        }
        if (!user.passwordHash) {
          await writeAuditLogin(user.id, email, "FAILED_NO_PASSWORD");
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          await writeAuditLogin(user.id, email, "FAILED_BAD_PASSWORD");
          return null;
        }

        // Two-factor gate.
        if (user.settings?.totpEnabledAt && user.settings.totpSecretEnc) {
          const code = (totpCode ?? "").trim();
          if (!code) throw new TotpRequired();
          const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
          if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not configured");
          const key = Buffer.from(ENCRYPTION_KEY, "hex");

          let secondFactorOk = false;
          if (/^\d{6}$/.test(code)) {
            const secret = decodeSecret(decryptFromString(user.settings.totpSecretEnc, key));
            secondFactorOk = verifyCode(secret, code);
          } else if (
            /^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/.test(code) &&
            user.settings.totpRecoveryCodesEnc
          ) {
            secondFactorOk = await consumeRecoveryCode(
              user.id,
              code,
              user.settings.totpRecoveryCodesEnc,
              key,
            );
          }
          if (!secondFactorOk) {
            await writeAuditLogin(user.id, email, "FAILED_BAD_TOTP");
            throw new TotpInvalid();
          }
        }

        await writeAuditLogin(user.id, email, "SUCCESS");

        // Returned object becomes the `user` argument in the jwt callback.
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          role: user.role,
          agencyId: user.agencyId,
        };
      },
    }),
  ],
});

type RecoveryEntry = { hash: string; used: boolean };

/**
 * Best-effort credentials-login throttle.
 *
 * Lazy-imports `ioredis` so the auth package keeps working in test/dev when
 * no Redis is available. Window: 15 attempts per email per 15 minutes.
 *
 * Returns `true` when the attempt should be refused. We always increment the
 * counter so that a stream of bad attempts keeps the gate closed.
 */
const LOGIN_MAX_ATTEMPTS = 15;
const LOGIN_WINDOW_SECONDS = 15 * 60;

let cachedRedis: import("ioredis").Redis | null | undefined;
async function getRedis(): Promise<import("ioredis").Redis | null> {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.REDIS_URL;
  if (!url) {
    cachedRedis = null;
    return null;
  }
  try {
    const { Redis } = await import("ioredis");
    cachedRedis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    return cachedRedis;
  } catch {
    cachedRedis = null;
    return null;
  }
}

async function checkAndRecordLoginAttempt(email: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    const key = `auth:login:${email.toLowerCase()}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, LOGIN_WINDOW_SECONDS);
    return n > LOGIN_MAX_ATTEMPTS;
  } catch {
    // Fail open — Redis down should not lock everyone out.
    return false;
  }
}

async function writeAuditLogin(
  userId: string | null,
  email: string,
  outcome:
    | "SUCCESS"
    | "FAILED_UNKNOWN_USER"
    | "FAILED_INACTIVE"
    | "FAILED_NO_PASSWORD"
    | "FAILED_BAD_PASSWORD"
    | "FAILED_BAD_TOTP"
    | "FAILED_THROTTLED",
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        type: outcome === "SUCCESS" ? "USER_LOGIN" : "USER_LOGIN_FAILED",
        targetKind: "User",
        targetId: userId,
        metadata: { email: email.toLowerCase(), outcome },
      },
    });
  } catch {
    // Audit write must never break login.
  }
}

async function consumeRecoveryCode(
  userId: string,
  code: string,
  encBlob: string,
  key: Buffer,
): Promise<boolean> {
  const json = decryptFromString(encBlob, key);
  const list: RecoveryEntry[] = JSON.parse(json);
  for (const entry of list) {
    if (entry.used) continue;
    const ok = await verifyPassword(code, entry.hash);
    if (ok) {
      entry.used = true;
      const { encryptToString } = await import("./crypto");
      const reencrypted = encryptToString(JSON.stringify(list), key);
      await prisma.userSettings.update({
        where: { userId },
        data: { totpRecoveryCodesEnc: reencrypted },
      });
      return true;
    }
  }
  // Reference hashPassword to keep the import alive — we use it in the api,
  // not here, but moving it would be a churn diff.
  void hashPassword;
  return false;
}
