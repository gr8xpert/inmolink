import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { feedConnectionSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ImportForm } from "../import-form";
import { RunHistory } from "./run-history";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ImportDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  let connection: feedConnectionSchemas.FeedConnection;
  try {
    connection = await apiFetch<feedConnectionSchemas.FeedConnection>(
      `/api/dashboard/imports/${encodeURIComponent(id)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const runs = await apiFetch<{ items: feedConnectionSchemas.FeedRun[] }>(
    `/api/dashboard/imports/${encodeURIComponent(id)}/runs?limit=50`,
  );

  const t = await getTranslations({ locale, namespace: "imports" });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={connection.feedUrl} description={connection.kind} />

      <div className="space-y-6">
        {connection.lastError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {t("lastErrorPrefix")}: {connection.lastError}
          </div>
        )}

        <SurfaceCard>
          <ImportForm locale={locale} mode="edit" initial={connection} />
        </SurfaceCard>

        <RunHistory locale={locale} connectionId={connection.id} runs={runs.items} />
      </div>
    </div>
  );
}
