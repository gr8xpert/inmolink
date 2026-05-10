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

const STATUS_BADGE: Record<webhookSchemas.WebhookDeliveryStatus, string> = {
  PENDING: "bg-blue-100 text-blue-900",
  SUCCEEDED: "bg-emerald-100 text-emerald-900",
  FAILED: "bg-amber-100 text-amber-900",
  DEAD_LETTERED: "bg-red-100 text-red-900",
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
    <main className="container mx-auto max-w-6xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Webhook deliveries</h1>
          <p className="text-sm text-muted-foreground">
            Outbound webhook deliveries across every agency. Click a row to see attempt history;
            replay any delivery (succeeded or dead-lettered) from there.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

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
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Filter
        </button>
      </form>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="overflow-x-auto rounded-md border bg-background shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Agency</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Attempts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 text-xs">
                  {new Date(d.createdAt).toLocaleString(locale)}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                    {d.eventType}
                  </span>
                </td>
                <td className="px-3 py-2 break-all font-mono text-[10px]">{d.endpointUrl}</td>
                <td className="px-3 py-2 text-xs">{d.agencyName ?? d.agencyId.slice(0, 12)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_BADGE[d.status]}`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{d.attemptCount}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/${locale}/dashboard/admin/webhook-deliveries/${d.id}`}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && !listError && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No deliveries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {data.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/admin/webhook-deliveries`,
              query: {
                ...(status ? { status } : {}),
                ...(eventType ? { eventType } : {}),
                ...(agencyId ? { agencyId } : {}),
                cursor: data.nextCursor,
              },
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next →
          </Link>
        </div>
      )}
    </main>
  );
}
