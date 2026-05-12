import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";

type Props = { params: Promise<{ locale: string }> };

export default async function ProfileSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "settings.profile" });
  const me = await apiFetch<meSchemas.MeDetail>("/api/dashboard/me");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <SurfaceCard>
        <ProfileForm locale={locale} initial={me} />
      </SurfaceCard>
    </div>
  );
}
