import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { FileText } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { deleteTemplateAction } from "./actions";
import { TemplateForm } from "./template-form";

type Props = { params: Promise<{ locale: string }> };

export default async function TemplatesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let items: marketingSchemas.EmailTemplate[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: marketingSchemas.EmailTemplate[] }>(
      "/api/dashboard/marketing/templates",
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

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
          {items.length === 0 && !listError ? (
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description="Create one above to reuse in campaigns."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((t) => (
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
      </div>
    </div>
  );
}
