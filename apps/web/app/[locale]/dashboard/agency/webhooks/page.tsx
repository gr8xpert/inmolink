import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { webhookSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Outbound webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Receive a signed POST every time something happens in your agency. We sign each request
            with HMAC-SHA256 so you can verify authenticity.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/agency`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Agency
        </Link>
      </header>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">Add endpoint</h2>
        <CreateEndpointForm locale={locale} />
      </section>

      <section className="space-y-3">
        {items.map((e) => (
          <div key={e.id} className="rounded-md border bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="break-all font-mono text-sm">{e.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.description ?? "—"} · {e.isActive ? "active" : "paused"} · secret …
                  {e.secretSuffix}
                </p>
                <p className="mt-2 flex flex-wrap gap-1">
                  {e.events.map((evt) => (
                    <span key={evt} className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase">
                      {evt}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <form action={testEndpointAction} className="flex gap-1">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <select
                    name="eventType"
                    defaultValue="PROPERTY_CREATED"
                    className="input text-xs"
                  >
                    {e.events.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Test
                  </button>
                </form>
                <form action={deleteEndpointAction}>
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
          </div>
        ))}
        {items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No endpoints yet.</p>
        )}
      </section>
    </main>
  );
}
