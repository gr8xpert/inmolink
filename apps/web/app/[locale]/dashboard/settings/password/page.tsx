import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PasswordForm } from "./password-form";

type Props = { params: Promise<{ locale: string }> };

export default async function PasswordSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "settings.password" });

  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <SurfaceCard>
        <PasswordForm />
      </SurfaceCard>
    </div>
  );
}
