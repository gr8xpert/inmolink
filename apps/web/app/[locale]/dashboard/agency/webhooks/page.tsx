import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { webhookSchemas } from "@inmolink/shared";
import { Webhook } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { deleteEndpointAction, testEndpointAction } from "./actions";
import { CreateEndpointForm } from "./create-form";

type Props = { params: Promise<{ locale: string }> };

export default async function WebhooksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let items: webhookSchemas.WebhookEndpoint[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: webhookSchemas.WebhookEndpoint[] }>(
      "/api/dashboard/agency/webhooks",
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Outbound webhooks"
        description="Receive a signed POST every time something happens in your agency. Each request signed with HMAC-SHA256."
      />

      <div className="space-y-6">
        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard title="Add endpoint">
          <CreateEndpointForm locale={locale} />
        </SurfaceCard>

        <SurfaceCard title="Configured endpoints" flush>
          {items.length === 0 && !listError ? (
            <EmptyState
              icon={Webhook}
              title="No endpoints yet"
              description="Add one above to start receiving signed events."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-sm text-foreground">{e.url}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.description ?? "—"} ·{" "}
                      <span className={e.isActive ? "text-success" : "text-muted-foreground"}>
                        {e.isActive ? "active" : "paused"}
                      </span>{" "}
                      · secret …{e.secretSuffix}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.events.map((evt) => (
                        <span
                          key={evt}
                          className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <form action={testEndpointAction} className="flex gap-1">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="locale" value={locale} />
                      <select
                        name="eventType"
                        defaultValue="PROPERTY_CREATED"
                        className="input h-8 py-0 text-xs"
                      >
                        {e.events.map((ev) => (
                          <option key={ev} value={ev}>
                            {ev}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="secondary">
                        Test
                      </Button>
                    </form>
                    <form action={deleteEndpointAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="locale" value={locale} />
                      <Button type="submit" size="sm" variant="secondary">
                        Delete
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
