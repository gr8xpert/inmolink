import { AuthError, signIn } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { error, callbackUrl } = await searchParams;
  setRequestLocale(locale);

  async function action(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: formData.get("callbackUrl")?.toString() || `/${locale}/dashboard`,
      });
    } catch (e) {
      if (e instanceof AuthError) {
        // Auth.js redirects with ?error=CredentialsSignin on bad creds
        redirect(`/${locale}/sign-in?error=${encodeURIComponent(e.type)}`);
      }
      throw e; // re-throw NEXT_REDIRECT etc.
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Inmolink</h1>
          <p className="text-sm text-muted-foreground">Multi-agent real estate marketplace</p>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "CredentialsSignin"
              ? "Invalid email or password."
              : "Sign-in failed. Please try again."}
          </div>
        )}

        <form action={action} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

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

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Sprint 1 — sign-up flow lands in Sprint 4. Use the seeded super-admin to test.
        </p>
      </div>
    </main>
  );
}
