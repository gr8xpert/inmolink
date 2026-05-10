import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { feedConnectionSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← {t("back")}
          </Link>
          <Link
            href={`/${locale}/dashboard/imports/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            {t("addNew")}
          </Link>
        </div>
      </header>

      <ImportsList locale={locale} initial={list.items} />

      <ManualUpload locale={locale} />
    </main>
  );
}
