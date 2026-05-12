import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { viewingRequestSchemas } from "@inmolink/shared";
import { cn } from "@inmolink/ui";
import { CalendarCheck } from "lucide-react";
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

export default async function ViewingsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "viewings" });

  const pageNum = Math.max(1, Number(strParam(sp.page) ?? "1") || 1);
  const qs = new URLSearchParams();
  qs.set("page", String(pageNum));
  qs.set("pageSize", String(PAGE_SIZE));
  const status = strParam(sp.status);
  const role = strParam(sp.role);
  if (status) qs.set("status", status);
  if (role) qs.set("role", role);

  const list = await apiFetch<viewingRequestSchemas.ViewingRequestListResponse>(
    `/api/dashboard/viewings?${qs.toString()}`,
  );

  const hrefForPage = (n: number): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || k === "cursor" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (n > 1) next.set("page", String(n));
    const qstr = next.toString();
    return qstr ? `/${locale}/dashboard/viewings?${qstr}` : `/${locale}/dashboard/viewings`;
  };

  const formatDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <LinkButton href={`/${locale}/dashboard/viewings/new`}>+ {t("new.title")}</LinkButton>
        }
      />

      <nav className="mb-6 flex gap-1.5 text-sm">
        {(["all", "owner", "introducer"] as const).map((r) => {
          const params = new URLSearchParams();
          if (r !== "all") params.set("role", r);
          const active = (role ?? "all") === r;
          return (
            <Link
              key={r}
              href={`/${locale}/dashboard/viewings?${params.toString()}`}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(`role.${r}`)}
            </Link>
          );
        })}
      </nav>

      <SurfaceCard flush>
        {list.items.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={t("empty")}
            cta={{ label: `+ ${t("new.title")}`, href: `/${locale}/dashboard/viewings/new` }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.items.map((v) => {
              const counterparty =
                session.user?.id === v.owner.id
                  ? `${v.introducer.firstName} ${v.introducer.lastName}`
                  : `${v.owner.firstName} ${v.owner.lastName}`;
              return (
                <li key={v.id}>
                  <Link
                    href={`/${locale}/dashboard/viewings/${v.id}`}
                    className="block px-5 py-4 transition hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {v.property.title ?? v.property.id}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {t("with", { name: counterparty })} ·{" "}
                          {t("client", { name: v.client.name })}
                        </div>
                        {v.scheduledAt && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t("scheduled")}:</span>{" "}
                            {formatDateTime(v.scheduledAt)}
                            {v.meetingPoint ? ` · ${v.meetingPoint}` : ""}
                          </div>
                        )}
                      </div>
                      <StatusBadge label={t(`status.${v.status}`)} tone={toneForStatus(v.status)} />
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
