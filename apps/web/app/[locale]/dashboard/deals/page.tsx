import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
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
  searchParams: Promise<{ status?: string; cursor?: string }>;
};

function formatMoney(cents: string, currency: string, locale: string): string {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export default async function DealsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "deals" });

  const qs = new URLSearchParams();
  if (search.status) qs.set("status", search.status);
  if (search.cursor) qs.set("cursor", search.cursor);
  const list = await apiFetch<dealSchemas.DealListResponse>(
    `/api/dashboard/deals?${qs.toString()}`,
  );

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

      {list.nextCursor && (
        <div className="mt-4 flex justify-end">
          <LinkButton
            href={`/${locale}/dashboard/deals?${new URLSearchParams({ ...search, cursor: list.nextCursor }).toString()}`}
            variant="secondary"
          >
            {t("next")} →
          </LinkButton>
        </div>
      )}
    </div>
  );
}
