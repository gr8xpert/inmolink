import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { env } from "@/env";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { exportSchemas } from "@inmolink/shared";
import { FileBarChart } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { deleteExportAction } from "./actions";
import { ExportsAutoRefresh } from "./auto-refresh";
import { ExportCreateForm } from "./create-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: exportSchemas.Export[];
  nextCursor: string | null;
  totalCount: number | null;
  page: number | null;
  pageSize: number | null;
  totalPages: number | null;
};

const PAGE_SIZE = 25;

const API_BASE = env.NEXT_PUBLIC_API_URL;

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function formatRelativeExpiry(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3_600_000);
  return `${hours}h left`;
}

export default async function ExportsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const kind = strParam(sp.kind);
  const status = strParam(sp.status);
  const pageNum = Math.max(1, Number(strParam(sp.page) ?? "1") || 1);

  const qs = new URLSearchParams();
  qs.set("page", String(pageNum));
  qs.set("pageSize", String(PAGE_SIZE));
  if (kind) qs.set("kind", kind);
  if (status) qs.set("status", status);

  let data: ListResponse = {
    items: [],
    nextCursor: null,
    totalCount: null,
    page: null,
    pageSize: null,
    totalPages: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/exports?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  const hasInflight = data.items.some((e) => e.status === "QUEUED" || e.status === "RUNNING");

  const hrefForPage = (n: number): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || k === "cursor" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (n > 1) next.set("page", String(n));
    const qstr = next.toString();
    return qstr ? `/${locale}/dashboard/exports?${qstr}` : `/${locale}/dashboard/exports`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ExportsAutoRefresh hasInflight={hasInflight} />
      <PageHeader
        title="Exports"
        description="Bulk-download your inventory as CSV or PDF brochure / portfolio. Files expire after 7 days. PRO plan required."
      />

      {listError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <SurfaceCard title="New export" className="mb-6">
        <ExportCreateForm locale={locale} />
      </SurfaceCard>

      <SurfaceCard title="Recent exports" flush>
        {data.items.length === 0 && !listError ? (
          <EmptyState
            icon={FileBarChart}
            title="No exports yet"
            description="Generate your first CSV or PDF using the form above."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{e.kind}</span>
                    <StatusBadge label={e.status} tone={toneForStatus(e.status)} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatBytes(e.resultBytes)} · {e.locale} ·{" "}
                    {new Date(e.createdAt).toLocaleString(locale)} ·{" "}
                    {formatRelativeExpiry(e.expiresAt)} · by {e.requestedByName}
                  </div>
                  {e.errorMessage && (
                    <div className="mt-1 text-xs text-danger">{e.errorMessage}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  {e.status === "SUCCESS" && (
                    <a
                      href={`${API_BASE}/api/dashboard/exports/${encodeURIComponent(e.id)}/download`}
                      className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      Download
                    </a>
                  )}
                  <form action={deleteExportAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <Button type="submit" variant="secondary" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      {data.totalPages && data.totalPages > 1 ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Pagination
            page={data.page ?? pageNum}
            totalPages={data.totalPages}
            hrefForPage={hrefForPage}
          />
          {data.totalCount !== null && (
            <p className="text-xs text-muted-foreground">
              {data.totalCount} total · page {data.page ?? pageNum} of {data.totalPages}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
