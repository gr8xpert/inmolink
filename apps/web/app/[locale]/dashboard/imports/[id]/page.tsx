import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { feedConnectionSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-3xl space-y-6 p-8">
      <div className="border-b pb-4">
        <Link
          href={`/${locale}/dashboard/imports`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold flex items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-sm font-mono">{connection.kind}</span>
          <span className="truncate">{connection.feedUrl}</span>
        </h1>
        {connection.lastError && (
          <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {t("lastErrorPrefix")}: {connection.lastError}
          </p>
        )}
      </div>

      <ImportForm locale={locale} mode="edit" initial={connection} />

      <RunHistory locale={locale} connectionId={connection.id} runs={runs.items} />
    </main>
  );
}
