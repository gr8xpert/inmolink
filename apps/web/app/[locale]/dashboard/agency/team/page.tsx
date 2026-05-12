import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { inviteSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { TeamManager } from "./team-manager";

type Props = { params: Promise<{ locale: string }> };

export default async function TeamPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (!session.user.agencyId) redirect(`/${locale}/dashboard`);
  if (session.user.role === "AGENT") {
    redirect(`/${locale}/dashboard/agency`);
  }

  const t = await getTranslations({ locale, namespace: "agency" });
  const team = await apiFetch<inviteSchemas.TeamResponse>("/api/dashboard/agency/team");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t("team.title")} description={t("team.subtitle")} />

      <SurfaceCard flush>
        <TeamManager locale={locale} initial={team} />
      </SurfaceCard>
    </div>
  );
}
