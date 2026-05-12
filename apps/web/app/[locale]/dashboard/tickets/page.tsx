import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { ticketSchemas } from "@inmolink/shared";
import { LifeBuoy } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; cursor?: string; q?: string }>;
};

const PRIORITY_TONE: Record<ticketSchemas.TicketPriority, "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

export default async function TicketsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { status, cursor, q } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const qs = new URLSearchParams();
  qs.set("limit", "25");
  if (status) qs.set("status", status);
  if (cursor) qs.set("cursor", cursor);
  if (q) qs.set("q", q);

  let data: { items: ticketSchemas.TicketSummary[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/tickets?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Support tickets"
        description="Open one for bugs, billing, or account questions."
        actions={<LinkButton href={`/${locale}/dashboard/tickets/new`}>+ New ticket</LinkButton>}
      />

      <form className="mb-6 flex flex-wrap gap-2">
        <select name="status" defaultValue={status ?? ""} className="input max-w-[200px]">
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search subject…"
          className="input flex-1 min-w-[200px]"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-muted"
        >
          Filter
        </button>
      </form>

      {listError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <SurfaceCard flush>
        {data.items.length === 0 && !listError ? (
          <EmptyState
            icon={LifeBuoy}
            title="No tickets yet"
            description="Open one if you hit a bug or need help with billing."
            cta={{ label: "+ New ticket", href: `/${locale}/dashboard/tickets/new` }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/${locale}/dashboard/tickets/${ticket.id}`}
                  className="block px-5 py-4 transition hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{ticket.number}
                        </span>
                        <span className="truncate font-medium text-foreground">
                          {ticket.subject}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{ticket.category}</span>
                        <span>· {ticket.openedByName}</span>
                        {ticket.assignedToName && <span>· assigned {ticket.assignedToName}</span>}
                        <span>· {ticket.messageCount} msgs</span>
                        <span>· {new Date(ticket.lastActivityAt).toLocaleString(locale)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge label={ticket.status} tone={toneForStatus(ticket.status)} />
                      <StatusBadge label={ticket.priority} tone={PRIORITY_TONE[ticket.priority]} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      {data.nextCursor && (
        <div className="mt-4 flex justify-end">
          <LinkButton
            href={{
              pathname: `/${locale}/dashboard/tickets`,
              query: {
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
                cursor: data.nextCursor,
              },
            }}
            variant="secondary"
          >
            Next →
          </LinkButton>
        </div>
      )}
    </div>
  );
}
