import { AuthError, decryptFromString, encryptToString, signIn } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    code?: string;
    callbackUrl?: string;
    /** Round-tripped after a successful password step that needs 2FA. */
    pending?: string;
  }>;
};

/**
 * Sign-in page with optional TOTP step. Two-factor flow:
 *   1. User submits email + password.
 *   2. authorize() throws TotpRequired → action stores the encrypted
 *      credentials in a short-lived, httpOnly cookie and redirects with
 *      `?code=totp_required`.
 *   3. The 2FA step's POST reads + decrypts the cookie and calls signIn
 *      again with the TOTP code; the cookie is cleared on success or on
 *      failure outside the 2FA path.
 *
 * Credentials never appear in the URL, hidden inputs, or browser history.
 * Cookie is encrypted with ENCRYPTION_KEY (AES-256-GCM), httpOnly, secure
 * in production, path=/sign-in, and 5-minute max-age.
 */

const PENDING_COOKIE = "inmolink-2fa-pending";
const PENDING_COOKIE_TTL_SECONDS = 5 * 60;

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY is not configured");
  return Buffer.from(hex, "hex");
}

export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { error, code, callbackUrl } = await searchParams;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get(PENDING_COOKIE)?.value;
  const totpStep = !!pendingCookie && (code === "totp_required" || code === "totp_invalid");

  async function action(formData: FormData) {
    "use server";
    const cookieStore = await cookies();
    try {
      const raw = formData.get("callbackUrl")?.toString();
      const safe = raw?.startsWith("/") && !raw.startsWith("//") ? raw : `/${locale}/dashboard`;
      const totpCode = formData.get("totpCode")?.toString();

      let email: string | undefined;
      let password: string | undefined;

      if (totpCode) {
        // 2FA submit: recover credentials from the encrypted cookie.
        const blob = cookieStore.get(PENDING_COOKIE)?.value;
        if (!blob) {
          redirect(`/${locale}/sign-in?error=CredentialsSignin`);
        }
        try {
          const payload = JSON.parse(decryptFromString(blob, getEncryptionKey())) as {
            email: string;
            password: string;
            exp: number;
          };
          if (payload.exp < Date.now()) {
            cookieStore.delete(PENDING_COOKIE);
            redirect(`/${locale}/sign-in?error=CredentialsSignin`);
          }
          email = payload.email;
          password = payload.password;
        } catch {
          cookieStore.delete(PENDING_COOKIE);
          redirect(`/${locale}/sign-in?error=CredentialsSignin`);
        }
      } else {
        email = formData.get("email")?.toString();
        password = formData.get("password")?.toString();
      }

      await signIn("credentials", {
        email,
        password,
        ...(totpCode ? { totpCode } : {}),
        redirectTo: safe,
      });

      // Success: clear the pending cookie if it existed.
      cookieStore.delete(PENDING_COOKIE);
    } catch (e) {
      if (e instanceof AuthError) {
        const t = e.type;
        const errCode = (e as AuthError & { code?: string }).code;
        const params = new URLSearchParams({ error: t });
        if (errCode) params.set("code", errCode);

        if (errCode === "totp_required" || errCode === "totp_invalid") {
          const email = formData.get("email")?.toString();
          const password = formData.get("password")?.toString();
          // Prefer freshly submitted credentials (first POST); fall back to
          // the existing pending cookie (re-submit with bad TOTP).
          let storeEmail = email;
          let storePassword = password;
          if (!storeEmail || !storePassword) {
            const blob = cookieStore.get(PENDING_COOKIE)?.value;
            if (blob) {
              try {
                const payload = JSON.parse(decryptFromString(blob, getEncryptionKey())) as {
                  email: string;
                  password: string;
                };
                storeEmail = payload.email;
                storePassword = payload.password;
              } catch {
                // ignore — fall through to error redirect without cookie
              }
            }
          }
          if (storeEmail && storePassword) {
            const blob = encryptToString(
              JSON.stringify({
                email: storeEmail,
                password: storePassword,
                exp: Date.now() + PENDING_COOKIE_TTL_SECONDS * 1000,
              }),
              getEncryptionKey(),
            );
            cookieStore.set(PENDING_COOKIE, blob, {
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: `/${locale}/sign-in`,
              maxAge: PENDING_COOKIE_TTL_SECONDS,
            });
          }
        } else {
          cookieStore.delete(PENDING_COOKIE);
        }

        const cb = formData.get("callbackUrl")?.toString();
        if (cb) params.set("callbackUrl", cb);
        redirect(`/${locale}/sign-in?${params.toString()}`);
      }
      throw e;
    }
  }

  const errorMessage =
    code === "totp_required"
      ? "Enter the code from your authenticator app."
      : code === "totp_invalid"
        ? "Code is incorrect or expired."
        : error === "CredentialsSignin"
          ? "Invalid email or password."
          : error
            ? "Sign-in failed. Please try again."
            : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Inmolink</h1>
          <p className="text-sm text-muted-foreground">
            {totpStep ? "Two-factor verification" : "Multi-agent real estate marketplace"}
          </p>
        </div>

        {errorMessage && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              code === "totp_required"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {errorMessage}
          </div>
        )}

        <form action={action} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

          {totpStep ? (
            <div className="space-y-2">
              <label htmlFor="totpCode" className="text-sm font-medium">
                Code (6 digits or recovery code)
              </label>
              <input
                id="totpCode"
                name="totpCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-lg tracking-widest shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {totpStep ? "Verify" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
