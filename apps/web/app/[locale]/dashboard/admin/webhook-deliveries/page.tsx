import { Button, LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { webhookSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    eventType?: string;
    agencyId?: string;
  }>;
};

const EVENT_TYPES = [
  "PROPERTY_CREATED",
  "PROPERTY_UPDATED",
  "PROPERTY_DELETED",
  "LEAD_CREATED",
  "VIEWING_REQUESTED",
  "VIEWING_ACCEPTED",
  "VIEWING_DECLINED",
  "VIEWING_COMPLETED",
  "DEAL_CONFIRMED",
  "DEAL_DISPUTED",
  "AGENT_INVITED",
  "AGENT_JOINED",
  "IMPORT_RUN_COMPLETED",
  "IMPORT_RUN_FAILED",
  "CHAT_MESSAGE_RECEIVED",
];

export default async function WebhookDeliveriesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { cursor, status, eventType, agencyId } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  qs.set("limit", "50");
  if (cursor) qs.set("cursor", cursor);
  if (status) qs.set("status", status);
  if (eventType) qs.set("eventType", eventType);
  if (agencyId) qs.set("agencyId", agencyId);

  let data: { items: webhookSchemas.WebhookDelivery[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/admin/webhook-deliveries?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Webhook deliveries"
        description="Outbound webhook deliveries across every agency. Click a row to see attempt history; replay any delivery (succeeded or dead-lettered) from there."
      />

      <div className="space-y-6">
        <SurfaceCard>
          <form className="flex flex-wrap gap-2">
            <select name="status" defaultValue={status ?? ""} className="input">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="SUCCEEDED">Succeeded</option>
              <option value="FAILED">Failed</option>
              <option value="DEAD_LETTERED">Dead-lettered</option>
            </select>
            <select name="eventType" defaultValue={eventType ?? ""} className="input">
              <option value="">All event types</option>
              {EVENT_TYPES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <input
              name="agencyId"
              defaultValue={agencyId ?? ""}
              placeholder="agencyId"
              className="input"
            />
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>
        </SurfaceCard>

        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Endpoint</th>
                  <th className="px-5 py-3">Agency</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Attempts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-5 py-3 text-xs">
                      {new Date(d.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                        {d.eventType}
                      </span>
                    </td>
                    <td className="px-5 py-3 break-all font-mono text-[10px]">{d.endpointUrl}</td>
                    <td className="px-5 py-3 text-xs">{d.agencyName ?? d.agencyId.slice(0, 12)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge label={d.status} tone={toneForStatus(d.status)} />
                    </td>
                    <td className="px-5 py-3 text-right text-xs">{d.attemptCount}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/${locale}/dashboard/admin/webhook-deliveries/${d.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && !listError && (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-muted-foreground">
                      No deliveries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        {data.nextCursor && (
          <div className="flex justify-end">
            <LinkButton
              variant="secondary"
              href={{
                pathname: `/${locale}/dashboard/admin/webhook-deliveries`,
                query: {
                  ...(status ? { status } : {}),
                  ...(eventType ? { eventType } : {}),
                  ...(agencyId ? { agencyId } : {}),
                  cursor: data.nextCursor,
                },
              }}
            >
              Next →
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
