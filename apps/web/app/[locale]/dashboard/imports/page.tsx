import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { feedConnectionSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ImportsList } from "./imports-list";
import { ManualUpload } from "./manual-upload";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: feedConnectionSchemas.FeedConnection[];
  totalCount: number | null;
  page: number | null;
  pageSize: number | null;
  totalPages: number | null;
};

const PAGE_SIZE = 25;

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ImportsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "imports" });

  const pageNum = Math.max(1, Number(strParam(sp.page) ?? "1") || 1);
  const qs = new URLSearchParams();
  qs.set("page", String(pageNum));
  qs.set("pageSize", String(PAGE_SIZE));

  const list = await apiFetch<ListResponse>(`/api/dashboard/imports?${qs.toString()}`);

  const hrefForPage = (n: number): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || k === "cursor" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (n > 1) next.set("page", String(n));
    const qstr = next.toString();
    return qstr ? `/${locale}/dashboard/imports?${qstr}` : `/${locale}/dashboard/imports`;
  };

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

      {list.totalPages && list.totalPages > 1 ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Pagination
            page={list.page ?? pageNum}
            totalPages={list.totalPages}
            hrefForPage={hrefForPage}
          />
          {list.totalCount !== null && (
            <p className="text-xs text-muted-foreground">
              {list.totalCount} total · page {list.page ?? pageNum} of {list.totalPages}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
