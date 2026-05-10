import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { agencySchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgencyDetailsForm } from "./agency-details-form";
import { AgencySettingsForm } from "./agency-settings-form";
import { AgencyTranslationsForm } from "./agency-translations-form";
import { BrandingUploader } from "./branding-uploader";

type Props = { params: Promise<{ locale: string }> };

export default async function AgencyDashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (!session.user.agencyId) redirect(`/${locale}/dashboard`);
  // AGENT can read but write endpoints reject; UI hides the "Agency" tile
  // for AGENT, so reaching here usually means at least AGENCY_ADMIN.

  const t = await getTranslations({ locale, namespace: "agency" });
  const agency = await apiFetch<agencySchemas.AgencyDetail>("/api/dashboard/agency");

  return (
    <main className="container mx-auto max-w-4xl space-y-8 p-8">
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

      <Section title={t("branding.title")} subtitle={t("branding.subtitle")}>
        <div className="grid gap-6 md:grid-cols-3">
          <BrandingUploader
            locale={locale}
            slot="logoR2Key"
            label={t("branding.logo")}
            currentUrl={agency.logoPublicUrl}
            aspect="square"
          />
          <BrandingUploader
            locale={locale}
            slot="bannerR2Key"
            label={t("branding.banner")}
            currentUrl={agency.bannerPublicUrl}
          />
          <BrandingUploader
            locale={locale}
            slot="heroImageR2Key"
            label={t("branding.hero")}
            currentUrl={agency.heroImagePublicUrl}
          />
        </div>
      </Section>

      <Section title={t("details.title")} subtitle={t("details.subtitle")}>
        <AgencyDetailsForm locale={locale} initial={agency} />
      </Section>

      <Section title={t("translations.title")} subtitle={t("translations.subtitle")}>
        <AgencyTranslationsForm locale={locale} initial={agency} />
      </Section>

      <Section title={t("settings.title")} subtitle={t("settings.subtitle")}>
        <AgencySettingsForm locale={locale} initial={agency} />
      </Section>

      <div className="rounded-md border bg-muted/30 p-4">
        <h2 className="text-sm font-medium">{t("team.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("team.subtitle")}</p>
        <Link
          href={`/${locale}/dashboard/agency/team`}
          className="mt-3 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-background"
        >
          {t("team.invite")}
        </Link>
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        <h2 className="text-sm font-medium">Outbound webhooks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          POST signed events (property / lead / viewing / deal / chat) to your own server.
        </p>
        <Link
          href={`/${locale}/dashboard/agency/webhooks`}
          className="mt-3 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-background"
        >
          Manage endpoints
        </Link>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-md border bg-background p-6 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}
