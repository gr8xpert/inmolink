import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { ticketSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReplyForm } from "./reply-form";
import { StatusButtons } from "./status-buttons";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

const STATUS_BADGE: Record<ticketSchemas.TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-900",
  IN_PROGRESS: "bg-amber-100 text-amber-900",
  RESOLVED: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-muted",
};

export default async function TicketDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  let ticket: ticketSchemas.TicketDetail | null = null;
  let loadError: string | null = null;
  try {
    ticket = await apiFetch<ticketSchemas.TicketDetail>(
      `/api/dashboard/tickets/${encodeURIComponent(id)}`,
    );
  } catch (err) {
    loadError = err instanceof ApiError ? err.message : "Failed to load";
  }

  if (loadError || !ticket) {
    return (
      <main className="container mx-auto max-w-3xl p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {loadError ?? "Ticket not found"}
        </div>
        <Link
          href={`/${locale}/dashboard/tickets`}
          className="mt-4 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Tickets
        </Link>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-2 border-b pb-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">
            <span className="text-muted-foreground">#{ticket.number}</span> {ticket.subject}
          </h1>
          <Link
            href={`/${locale}/dashboard/tickets`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← Tickets
          </Link>
        </div>
        <p className="text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_BADGE[ticket.status]}`}
          >
            {ticket.status}
          </span>{" "}
          <span className="text-muted-foreground">
            {ticket.priority} · {ticket.category} · opened by {ticket.openedByName}
            {ticket.assignedToName && <> · assigned {ticket.assignedToName}</>}
          </span>
        </p>
      </header>

      {ticket.callerActions.canChangeStatus && (
        <StatusButtons id={ticket.id} status={ticket.status} locale={locale} />
      )}

      <section className="space-y-4">
        {ticket.messages.map((m) => (
          <article
            key={m.id}
            className={`rounded-md border p-4 shadow-sm ${
              m.isInternal ? "border-amber-200 bg-amber-50" : "bg-background"
            }`}
          >
            <header className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                {m.author.firstName} {m.author.lastName}{" "}
                <span className="text-xs text-muted-foreground">({m.author.role})</span>
                {m.isInternal && (
                  <span className="ml-2 rounded bg-amber-200 px-2 py-0.5 text-xs uppercase text-amber-900">
                    Internal note
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(m.createdAt).toLocaleString(locale)}
              </p>
            </header>
            <p className="whitespace-pre-wrap text-sm">{m.body}</p>
            {m.attachments.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {m.attachments.map((a) => (
                  <li key={a.mediaObjectId}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline"
                    >
                      📎 {a.name} ({(a.size / 1024).toFixed(1)} KB)
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      {ticket.callerActions.canReply && (
        <ReplyForm
          id={ticket.id}
          locale={locale}
          showInternalToggle={ticket.callerActions.canSeeInternal}
        />
      )}
    </main>
  );
}
