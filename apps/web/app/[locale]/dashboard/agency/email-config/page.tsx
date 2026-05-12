import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="SMTP & DKIM"
        description="Per-agency outgoing email credentials. PRO plan required."
      />

      {loadError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <SurfaceCard>
        <EmailConfigForm locale={locale} initial={config} userEmail={session.user.email ?? null} />
      </SurfaceCard>
    </div>
  );
}
