import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { FileText } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { deleteTemplateAction } from "./actions";
import { TemplateForm } from "./template-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: marketingSchemas.EmailTemplate[];
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

export default async function TemplatesPage({ params, searchParams }: Props) {
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
    totalCount: null,
    page: null,
    pageSize: null,
    totalPages: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/marketing/templates?${qs.toString()}`);
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
      ? `/${locale}/dashboard/marketing/templates?${qstr}`
      : `/${locale}/dashboard/marketing/templates`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Email templates"
        description="Merge tags: {{contact.firstName}} {{agency.name}} {{property.title}} {{unsubscribeUrl}}."
      />

      <div className="space-y-6">
        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard title="New template">
          <TemplateForm locale={locale} />
        </SurfaceCard>

        <SurfaceCard title="Existing templates" flush>
          {data.items.length === 0 && !listError ? (
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description="Create one above to reuse in campaigns."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
                  </div>
                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <Button type="submit" size="sm" variant="secondary">
                      Delete
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
