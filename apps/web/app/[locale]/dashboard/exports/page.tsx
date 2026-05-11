import { env } from "@/env";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { exportSchemas } from "@inmolink/shared";
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

const STATUS_BADGE: Record<exportSchemas.ExportStatus, string> = {
  QUEUED: "bg-blue-100 text-blue-900",
  RUNNING: "bg-amber-100 text-amber-900",
  SUCCESS: "bg-emerald-100 text-emerald-900",
  FAILED: "bg-red-100 text-red-900",
};

const API_BASE = env.NEXT_PUBLIC_API_URL;

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function formatRelativeExpiry(iso: string | null, _locale: string): string {
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
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <ExportsAutoRefresh hasInflight={hasInflight} />
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Exports</h1>
          <p className="text-sm text-muted-foreground">
            Bulk-download your inventory as CSV or PDF brochure / portfolio. Files expire after 7
            days. PRO plan required for both kinds.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Dashboard
        </Link>
      </header>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">New export</h2>
        <ExportCreateForm locale={locale} />
      </section>

      <section className="space-y-2">
        {data.items.map((e) => (
          <div
            key={e.id}
            className="flex flex-col gap-2 rounded-md border bg-background p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{e.kind}</p>
              <p className="mt-1 text-xs">
                <span
                  className={`rounded px-2 py-0.5 font-semibold uppercase ${STATUS_BADGE[e.status]}`}
                >
                  {e.status}
                </span>{" "}
                <span className="text-muted-foreground">
                  {formatBytes(e.resultBytes)} · {e.locale} ·{" "}
                  {new Date(e.createdAt).toLocaleString(locale)} ·{" "}
                  {formatRelativeExpiry(e.expiresAt, locale)} · by {e.requestedByName}
                </span>
              </p>
              {e.errorMessage && <p className="mt-1 text-xs text-red-700">{e.errorMessage}</p>}
            </div>
            <div className="flex gap-2">
              {e.status === "SUCCESS" && (
                <a
                  href={`${API_BASE}/api/dashboard/exports/${encodeURIComponent(e.id)}/download`}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90"
                >
                  Download
                </a>
              )}
              <form action={deleteExportAction}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100"
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {data.items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        )}
      </section>

      {data.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/exports`,
              query: {
                ...(kind ? { kind } : {}),
                ...(status ? { status } : {}),
                cursor: data.nextCursor,
              },
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next →
          </Link>
        </div>
      )}
    </main>
  );
}
