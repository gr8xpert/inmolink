import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PreferencesForm } from "./preferences-form";

type Props = { params: Promise<{ locale: string }> };

export default async function PreferencesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "settings.preferences" });
  const settings = await apiFetch<meSchemas.UserSettingsT>("/api/dashboard/me/settings");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <SurfaceCard>
        <PreferencesForm locale={locale} initial={settings} />
      </SurfaceCard>
    </div>
  );
}
