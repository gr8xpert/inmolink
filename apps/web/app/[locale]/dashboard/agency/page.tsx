import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { agencySchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
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

  const t = await getTranslations({ locale, namespace: "agency" });
  const agency = await apiFetch<agencySchemas.AgencyDetail>("/api/dashboard/agency");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="space-y-6">
        <SurfaceCard title={t("branding.title")} description={t("branding.subtitle")}>
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
        </SurfaceCard>

        <SurfaceCard title={t("details.title")} description={t("details.subtitle")}>
          <AgencyDetailsForm locale={locale} initial={agency} />
        </SurfaceCard>

        <SurfaceCard title={t("translations.title")} description={t("translations.subtitle")}>
          <AgencyTranslationsForm locale={locale} initial={agency} />
        </SurfaceCard>

        <SurfaceCard title={t("settings.title")} description={t("settings.subtitle")}>
          <AgencySettingsForm locale={locale} initial={agency} />
        </SurfaceCard>

        <SurfaceCard
          title={t("team.title")}
          description={t("team.subtitle")}
          actions={
            <LinkButton href={`/${locale}/dashboard/agency/team`} variant="secondary">
              {t("team.invite")}
            </LinkButton>
          }
        >
          <p className="text-sm text-muted-foreground">
            Manage team members, send invitations, and adjust roles.
          </p>
        </SurfaceCard>

        <SurfaceCard
          title="Outbound webhooks"
          description="POST signed events (property / lead / viewing / deal / chat) to your own server."
          actions={
            <LinkButton href={`/${locale}/dashboard/agency/webhooks`} variant="secondary">
              Manage endpoints
            </LinkButton>
          }
        >
          <p className="text-sm text-muted-foreground">
            Subscribe to events, rotate signing secrets, and replay failed deliveries.
          </p>
        </SurfaceCard>
      </div>
    </div>
  );
}
