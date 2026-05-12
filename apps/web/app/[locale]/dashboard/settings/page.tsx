import { HubTile } from "@/components/dashboard/hub-tile";
import { PageHeader } from "@/components/dashboard/page-header";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import { KeyRound, Settings as SettingsIcon, ShieldCheck, UserCircle } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function SettingsHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "settings" });
  const me = await apiFetch<meSchemas.MeDetail>("/api/dashboard/me");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <HubTile
          href={`/${locale}/dashboard/settings/profile`}
          title={t("profile.title")}
          description={t("profile.subtitle")}
          icon={UserCircle}
        />
        <HubTile
          href={`/${locale}/dashboard/settings/password`}
          title={t("password.title")}
          description={t("password.subtitle")}
          icon={KeyRound}
        />
        <HubTile
          href={`/${locale}/dashboard/settings/preferences`}
          title={t("preferences.title")}
          description={t("preferences.subtitle")}
          icon={SettingsIcon}
        />
        <HubTile
          href={`/${locale}/dashboard/settings/two-factor`}
          title={t("twoFactor.title")}
          description={me.twoFactorEnabled ? t("twoFactor.enabled") : t("twoFactor.disabled")}
          icon={ShieldCheck}
        />
      </div>
    </div>
  );
}
