import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { Handshake } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 20;

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatMoney(cents: string, currency: string, locale: string): string {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export default async function DealsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "deals" });

  const pageNum = Math.max(1, Number(strParam(sp.page) ?? "1") || 1);
  const qs = new URLSearchParams();
  qs.set("page", String(pageNum));
  qs.set("pageSize", String(PAGE_SIZE));
  const status = strParam(sp.status);
  if (status) qs.set("status", status);

  const list = await apiFetch<dealSchemas.DealListResponse>(
    `/api/dashboard/deals?${qs.toString()}`,
  );

  const hrefForPage = (n: number): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || k === "cursor" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (n > 1) next.set("page", String(n));
    const qstr = next.toString();
    return qstr ? `/${locale}/dashboard/deals?${qstr}` : `/${locale}/dashboard/deals`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <LinkButton href={`/${locale}/dashboard/deals/new`}>+ {t("submitNew")}</LinkButton>
        }
      />

      <SurfaceCard flush>
        {list.items.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={t("empty")}
            cta={{ label: `+ ${t("submitNew")}`, href: `/${locale}/dashboard/deals/new` }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.items.map((d) => {
              const counterparty =
                session.user?.id === d.owner.id
                  ? `${d.introducer.firstName} ${d.introducer.lastName}`
                  : `${d.owner.firstName} ${d.owner.lastName}`;
              return (
                <li key={d.id}>
                  <Link
                    href={`/${locale}/dashboard/deals/${d.id}`}
                    className="block px-5 py-4 transition hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {d.property.title ?? d.property.id}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          with {counterparty} ·{" "}
                          <span className="font-mono">
                            {formatMoney(d.agreedPriceCents, d.currency, locale)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("fields.totalCommission")}:{" "}
                          <span className="font-mono">
                            {formatMoney(d.totalCommissionCents, d.currency, locale)}
                          </span>{" "}
                          · {Number(d.commissionPct).toFixed(2)}%
                        </div>
                      </div>
                      <StatusBadge label={t(`status.${d.status}`)} tone={toneForStatus(d.status)} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SurfaceCard>

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
