import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { env } from "@/env";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { exportSchemas } from "@inmolink/shared";
import { FileBarChart } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteExportAction } from "./actions";
import { ExportsAutoRefresh } from "./auto-refresh";
import { ExportCreateForm } from "./create-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string; status?: string; cursor?: string }>;
};

const API_BASE = env.NEXT_PUBLIC_API_URL;

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
  const { kind, status, cursor } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const qs = new URLSearchParams();
  qs.set("limit", "25");
  if (kind) qs.set("kind", kind);
  if (status) qs.set("status", status);
  if (cursor) qs.set("cursor", cursor);

  let data: { items: exportSchemas.Export[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/exports?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  const hasInflight = data.items.some((e) => e.status === "QUEUED" || e.status === "RUNNING");

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

      {data.nextCursor && (
        <div className="mt-4 flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/exports`,
              query: {
                ...(kind ? { kind } : {}),
                ...(status ? { status } : {}),
                cursor: data.nextCursor,
              },
            }}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-muted"
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
