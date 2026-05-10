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

        if (!user) return null;
        if (!user.isActive) return null;
        if (!user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

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
          if (!secondFactorOk) throw new TotpInvalid();
        }

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
