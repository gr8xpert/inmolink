import { AuthError, signIn } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
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
 *   2. authorize() throws TotpRequired → ?code=totp_required.
 *   3. Page swaps to the 2FA step, carrying email + password in hidden
 *      fields (server-side; password is short-lived in the user's UA
 *      until they hit submit again).
 *   4. User submits 6-digit TOTP or recovery code; authorize() consumes
 *      the recovery code if used and returns the User on success.
 *
 * Carrying the password through a hidden field is the documented
 * NextAuth pattern for Credentials 2FA. The alternative (server-side
 * pending-login cookie) is heavier; revisit if a UX bug appears.
 */

export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { error, code, callbackUrl, pending } = await searchParams;
  setRequestLocale(locale);

  const totpStep = code === "totp_required" || code === "totp_invalid" || pending === "1";

  async function action(formData: FormData) {
    "use server";
    try {
      const raw = formData.get("callbackUrl")?.toString();
      const safe = raw?.startsWith("/") && !raw.startsWith("//") ? raw : `/${locale}/dashboard`;
      const totpCode = formData.get("totpCode")?.toString();
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        ...(totpCode ? { totpCode } : {}),
        redirectTo: safe,
      });
    } catch (e) {
      if (e instanceof AuthError) {
        const t = e.type;
        // Custom CredentialsSignin codes surface as `error.code` per
        // Auth.js v5 — re-encode them in the URL so the page swaps to
        // the 2FA step.
        const errCode = (e as AuthError & { code?: string }).code;
        const params = new URLSearchParams({ error: t });
        if (errCode) params.set("code", errCode);
        if (errCode === "totp_required" || errCode === "totp_invalid") {
          // Round-trip email + password back into the 2FA step.
          const email = formData.get("email")?.toString();
          const password = formData.get("password")?.toString();
          if (email) params.set("emailRT", email);
          if (password) params.set("pwRT", password);
          params.set("pending", "1");
        }
        const cb = formData.get("callbackUrl")?.toString();
        if (cb) params.set("callbackUrl", cb);
        redirect(`/${locale}/sign-in?${params.toString()}`);
      }
      throw e;
    }
  }

  // searchParams.error / code is available; emailRT + pwRT are only present
  // mid-2FA step. Reading them off searchParams directly works because
  // searchParams is the authoritative source for the page render.
  const sp = (await searchParams) as Record<string, string | undefined>;
  const emailRT = sp.emailRT;
  const pwRT = sp.pwRT;

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
            <>
              <input type="hidden" name="email" value={emailRT ?? ""} />
              <input type="hidden" name="password" value={pwRT ?? ""} />
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
            </>
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
