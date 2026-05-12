import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { ShieldOff } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { removeSuppressionAction } from "./actions";
import { AddSuppressionForm } from "./add-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SuppressionRow = {
  id: string;
  email: string;
  reason: marketingSchemas.SuppressionReason;
  notes: string | null;
  createdAt: string;
};

type ListResponse = {
  items: SuppressionRow[];
  nextCursor: string | null;
  totalCount: number | null;
  page: number | null;
  pageSize: number | null;
  totalPages: number | null;
};

const PAGE_SIZE = 50;

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function SuppressionsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  const pageNum = Math.max(1, Number(strParam(sp.page) ?? "1") || 1);
  const qs = new URLSearchParams();
  qs.set("page", String(pageNum));
  qs.set("pageSize", String(PAGE_SIZE));

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
    data = await apiFetch(`/api/dashboard/marketing/suppressions?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  const hrefForPage = (n: number): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || k === "cursor" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (n > 1) next.set("page", String(n));
    const qstr = next.toString();
    return qstr
      ? `/${locale}/dashboard/marketing/suppressions?${qstr}`
      : `/${locale}/dashboard/marketing/suppressions`;
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Suppressions"
        description="Hard blocks. We never send to addresses on this list — bounces and unsubscribes are added automatically."
      />

      <div className="space-y-6">
        <SurfaceCard title="Manually add">
          <AddSuppressionForm locale={locale} />
        </SurfaceCard>

        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard title="Suppressed addresses" flush>
          {data.items.length === 0 && !listError ? (
            <EmptyState
              icon={ShieldOff}
              title="No suppressions"
              description="Bounces and unsubscribes will land here automatically."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{s.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.reason} · {new Date(s.createdAt).toLocaleString(locale)}
                      {s.notes && <> · {s.notes}</>}
                    </p>
                  </div>
                  <form action={removeSuppressionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <Button type="submit" size="sm" variant="secondary">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        {data.totalPages && data.totalPages > 1 ? (
          <div className="flex flex-col items-center gap-2">
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
    </div>
  );
}
