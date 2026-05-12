import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { feedConnectionSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ImportsList } from "./imports-list";
import { ManualUpload } from "./manual-upload";

type Props = { params: Promise<{ locale: string }> };

export default async function ImportsListPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "imports" });
  const list = await apiFetch<{ items: feedConnectionSchemas.FeedConnection[] }>(
    "/api/dashboard/imports",
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<LinkButton href={`/${locale}/dashboard/imports/new`}>+ {t("addNew")}</LinkButton>}
      />

      <div className="space-y-6">
        <SurfaceCard title="Connected feeds" flush>
          <ImportsList locale={locale} initial={list.items} />
        </SurfaceCard>

        <SurfaceCard title="Manual upload" description="One-off CSV / XLSX upload">
          <ManualUpload locale={locale} />
        </SurfaceCard>
      </div>
    </div>
  );
}
