import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { ticketSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; cursor?: string; q?: string }>;
};

const STATUS_BADGE: Record<ticketSchemas.TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-900",
  IN_PROGRESS: "bg-amber-100 text-amber-900",
  RESOLVED: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-muted",
};

const PRIORITY_BADGE: Record<ticketSchemas.TicketPriority, string> = {
  LOW: "bg-muted",
  NORMAL: "bg-muted",
  HIGH: "bg-amber-100 text-amber-900",
  URGENT: "bg-red-100 text-red-900",
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
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Support requests. Open one for bugs, billing, or account questions.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← Dashboard
          </Link>
          <Link
            href={`/${locale}/dashboard/tickets/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
          >
            + New ticket
          </Link>
        </div>
      </header>

      <form className="flex gap-2">
        <select name="status" defaultValue={status ?? ""} className="input">
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
          className="input flex-1"
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

      <section className="space-y-2">
        {data.items.map((t) => (
          <Link
            key={t.id}
            href={`/${locale}/dashboard/tickets/${t.id}`}
            className="flex items-center justify-between rounded-md border bg-background p-3 shadow-sm transition hover:bg-muted/30"
          >
            <div>
              <p className="font-medium">
                <span className="text-muted-foreground">#{t.number}</span> {t.subject}
              </p>
              <p className="mt-1 text-xs">
                <span
                  className={`rounded px-2 py-0.5 font-semibold uppercase ${STATUS_BADGE[t.status]}`}
                >
                  {t.status}
                </span>{" "}
                <span
                  className={`rounded px-2 py-0.5 font-semibold uppercase ${PRIORITY_BADGE[t.priority]}`}
                >
                  {t.priority}
                </span>{" "}
                <span className="text-muted-foreground">
                  {t.category} · {t.openedByName}
                  {t.assignedToName && <> · assigned {t.assignedToName}</>} · {t.messageCount} msgs
                  · {new Date(t.lastActivityAt).toLocaleString(locale)}
                </span>
              </p>
            </div>
          </Link>
        ))}
        {data.items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No tickets yet.</p>
        )}
      </section>

      {data.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/tickets`,
              query: {
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
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
