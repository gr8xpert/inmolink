import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailConfigForm } from "./email-config-form";

type Props = { params: Promise<{ locale: string }> };

export default async function EmailConfigPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let config: marketingSchemas.EmailConfigOutput | null = null;
  let loadError: string | null = null;
  try {
    config = await apiFetch<marketingSchemas.EmailConfigOutput | null>(
      "/api/dashboard/marketing/email-config",
    );
  } catch (err) {
    loadError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">SMTP &amp; DKIM</h1>
          <p className="text-sm text-muted-foreground">
            Per-agency outgoing email credentials. PRO plan required.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/marketing`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Marketing
        </Link>
      </header>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {loadError}
        </div>
      )}

      <EmailConfigForm locale={locale} initial={config} userEmail={session.user.email ?? null} />
    </main>
  );
}
