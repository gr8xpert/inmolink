import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { inviteSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    // Agents can't manage the team — bounce back to the agency landing.
    redirect(`/${locale}/dashboard/agency`);
  }

  const t = await getTranslations({ locale, namespace: "agency" });
  const team = await apiFetch<inviteSchemas.TeamResponse>("/api/dashboard/agency/team");

  return (
    <main className="container mx-auto max-w-3xl space-y-6 p-8">
      <div className="border-b pb-4">
        <Link
          href={`/${locale}/dashboard/agency`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t("team.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
      </div>

      <TeamManager locale={locale} initial={team} />
    </main>
  );
}
