import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-2xl space-y-6 p-8">
      <div className="border-b pb-4">
        <Link
          href={`/${locale}/dashboard/settings`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <PreferencesForm locale={locale} initial={settings} />
    </main>
  );
}
