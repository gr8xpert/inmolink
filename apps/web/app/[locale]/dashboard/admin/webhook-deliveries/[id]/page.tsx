import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { webhookSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReplayButton } from "./replay-button";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

const STATUS_BADGE: Record<webhookSchemas.WebhookDeliveryStatus, string> = {
  PENDING: "bg-blue-100 text-blue-900",
  SUCCEEDED: "bg-emerald-100 text-emerald-900",
  FAILED: "bg-amber-100 text-amber-900",
  DEAD_LETTERED: "bg-red-100 text-red-900",
};

export default async function WebhookDeliveryDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let detail: webhookSchemas.WebhookDeliveryDetail | null = null;
  let loadError: string | null = null;
  try {
    detail = await apiFetch<webhookSchemas.WebhookDeliveryDetail>(
      `/api/dashboard/admin/webhook-deliveries/${encodeURIComponent(id)}`,
    );
  } catch (err) {
    loadError = err instanceof ApiError ? err.message : "Failed to load";
  }

  if (loadError || !detail) {
    return (
      <main className="container mx-auto max-w-3xl p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {loadError ?? "Delivery not found"}
        </div>
        <Link
          href={`/${locale}/dashboard/admin/webhook-deliveries`}
          className="mt-4 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Deliveries
        </Link>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-2 border-b pb-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Delivery #{detail.id.slice(0, 12)}</h1>
          <Link
            href={`/${locale}/dashboard/admin/webhook-deliveries`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← Deliveries
          </Link>
        </div>
        <p className="text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_BADGE[detail.status]}`}
          >
            {detail.status}
          </span>{" "}
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
            {detail.eventType}
          </span>{" "}
          <span className="text-muted-foreground">
            {detail.agencyName ?? detail.agencyId} · {detail.attemptCount} attempts
            {detail.lastAttemptAt && (
              <> · last {new Date(detail.lastAttemptAt).toLocaleString(locale)}</>
            )}
          </span>
        </p>
        <p className="break-all font-mono text-xs">{detail.endpointUrl}</p>
      </header>

      <ReplayButton id={detail.id} locale={locale} />

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">Payload</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono text-[10px]">
          {JSON.stringify(detail.payload, null, 2)}
        </pre>
      </section>

      <section className="rounded-md border bg-background shadow-sm">
        <h2 className="px-4 pt-4 font-semibold">Attempts</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2 text-right">Duration</th>
              <th className="px-3 py-2">Body / error</th>
            </tr>
          </thead>
          <tbody>
            {detail.attempts.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 text-xs">
                  {new Date(a.attemptedAt).toLocaleString(locale)}
                </td>
                <td className="px-3 py-2 text-xs">
                  {a.responseStatus ?? <span className="text-red-700">ERR</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs">{a.durationMs ?? "—"}ms</td>
                <td className="px-3 py-2 font-mono text-[10px]">
                  {a.errorMessage ? (
                    <span className="text-red-700">{a.errorMessage}</span>
                  ) : (
                    (a.responseBodyTrunc ?? "—").slice(0, 200)
                  )}
                </td>
              </tr>
            ))}
            {detail.attempts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No attempts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
