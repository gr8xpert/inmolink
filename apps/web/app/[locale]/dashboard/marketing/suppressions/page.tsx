import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { ShieldOff } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { removeSuppressionAction } from "./actions";
import { AddSuppressionForm } from "./add-form";

type Props = { params: Promise<{ locale: string }> };

type SuppressionRow = {
  id: string;
  email: string;
  reason: marketingSchemas.SuppressionReason;
  notes: string | null;
  createdAt: string;
};

export default async function SuppressionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let items: SuppressionRow[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: SuppressionRow[] }>(
      "/api/dashboard/marketing/suppressions?limit=200",
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

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
          {items.length === 0 && !listError ? (
            <EmptyState
              icon={ShieldOff}
              title="No suppressions"
              description="Bounces and unsubscribes will land here automatically."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((s) => (
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
      </div>
    </div>
  );
}
