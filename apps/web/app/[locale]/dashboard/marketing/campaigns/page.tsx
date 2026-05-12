import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { Send } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { cancelCampaignAction, deleteCampaignAction, sendNowAction } from "./actions";
import { CampaignForm } from "./campaign-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: marketingSchemas.Campaign[];
  nextCursor: string | null;
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

export default async function CampaignsPage({ params, searchParams }: Props) {
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
    data = await apiFetch(`/api/dashboard/marketing/campaigns?${qs.toString()}`);
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
      ? `/${locale}/dashboard/marketing/campaigns?${qstr}`
      : `/${locale}/dashboard/marketing/campaigns`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Campaigns"
        description="Send a campaign now or schedule it. Per-recipient open / click / bounce / unsubscribe tracking."
      />

      <div className="space-y-6">
        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard title="New campaign">
          <CampaignForm locale={locale} />
        </SurfaceCard>

        <SurfaceCard title="Recent campaigns" flush>
          {data.items.length === 0 && !listError ? (
            <EmptyState
              icon={Send}
              title="No campaigns yet"
              description="Create your first using the form above."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <StatusBadge label={c.status} tone={toneForStatus(c.status)} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.recipientCount} recipients · sent {c.sentCount} · opened {c.openedCount} ·
                      clicked {c.clickedCount} · bounced {c.bouncedCount} · unsub{" "}
                      {c.unsubscribedCount}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(c.status === "DRAFT" ||
                      c.status === "SCHEDULED" ||
                      c.status === "PAUSED") && (
                      <form action={sendNowAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button type="submit" size="sm">
                          Send now
                        </Button>
                      </form>
                    )}
                    {(c.status === "DRAFT" ||
                      c.status === "SCHEDULED" ||
                      c.status === "SENDING" ||
                      c.status === "PAUSED") && (
                      <form action={cancelCampaignAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button type="submit" size="sm" variant="secondary">
                          Cancel
                        </Button>
                      </form>
                    )}
                    {c.status !== "SENDING" && (
                      <form action={deleteCampaignAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button type="submit" size="sm" variant="secondary">
                          Delete
                        </Button>
                      </form>
                    )}
                  </div>
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
