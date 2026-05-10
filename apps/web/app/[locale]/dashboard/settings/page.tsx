import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function SettingsHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "settings" });
  const me = await apiFetch<meSchemas.MeDetail>("/api/dashboard/me");

  const tiles: Array<{ href: string; title: string; subtitle: string }> = [
    {
      href: `/${locale}/dashboard/settings/profile`,
      title: t("profile.title"),
      subtitle: t("profile.subtitle"),
    },
    {
      href: `/${locale}/dashboard/settings/password`,
      title: t("password.title"),
      subtitle: t("password.subtitle"),
    },
    {
      href: `/${locale}/dashboard/settings/preferences`,
      title: t("preferences.title"),
      subtitle: t("preferences.subtitle"),
    },
    {
      href: `/${locale}/dashboard/settings/two-factor`,
      title: t("twoFactor.title"),
      subtitle: me.twoFactorEnabled ? t("twoFactor.enabled") : t("twoFactor.disabled"),
    },
  ];

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <div className="border-b pb-4">
        <Link
          href={`/${locale}/dashboard`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">{tile.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tile.subtitle}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
