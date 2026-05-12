import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { webhookSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ReplayButton } from "./replay-button";

type Props = {
  params: Promise<{ locale: string; id: string }>;
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
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError ?? "Delivery not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={`Delivery #${detail.id.slice(0, 12)}`} />

      <div className="space-y-6">
        <SurfaceCard>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge label={detail.status} tone={toneForStatus(detail.status)} />
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
              {detail.eventType}
            </span>
            <span className="text-muted-foreground">
              {detail.agencyName ?? detail.agencyId} · {detail.attemptCount} attempts
              {detail.lastAttemptAt && (
                <> · last {new Date(detail.lastAttemptAt).toLocaleString(locale)}</>
              )}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-xs">{detail.endpointUrl}</p>
          <div className="mt-4">
            <ReplayButton id={detail.id} locale={locale} />
          </div>
        </SurfaceCard>

        <SurfaceCard title="Payload">
          <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-[10px]">
            {JSON.stringify(detail.payload, null, 2)}
          </pre>
        </SurfaceCard>

        <SurfaceCard title="Attempts" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">HTTP</th>
                  <th className="px-5 py-3 text-right">Duration</th>
                  <th className="px-5 py-3">Body / error</th>
                </tr>
              </thead>
              <tbody>
                {detail.attempts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-5 py-3 text-xs">
                      {new Date(a.attemptedAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {a.responseStatus ?? <span className="text-danger">ERR</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">{a.durationMs ?? "—"}ms</td>
                    <td className="px-5 py-3 font-mono text-[10px]">
                      {a.errorMessage ? (
                        <span className="text-danger">{a.errorMessage}</span>
                      ) : (
                        (a.responseBodyTrunc ?? "—").slice(0, 200)
                      )}
                    </td>
                  </tr>
                ))}
                {detail.attempts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted-foreground">
                      No attempts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
