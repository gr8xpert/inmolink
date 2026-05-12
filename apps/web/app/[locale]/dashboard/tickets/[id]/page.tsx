import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { ticketSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ReplyForm } from "./reply-form";
import { StatusButtons } from "./status-buttons";

type Props = {
  params: Promise<{ locale: string; id: string }>;
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
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError ?? "Ticket not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={ticket.subject}
        description={`#${ticket.number} · ${ticket.priority} · ${ticket.category} · opened by ${ticket.openedByName}${ticket.assignedToName ? ` · assigned ${ticket.assignedToName}` : ""}`}
        actions={<StatusBadge label={ticket.status} tone={toneForStatus(ticket.status)} />}
      />

      <div className="space-y-6">
        {ticket.callerActions.canChangeStatus && (
          <StatusButtons id={ticket.id} status={ticket.status} locale={locale} />
        )}

        <div className="space-y-4">
          {ticket.messages.map((m) => (
            <article
              key={m.id}
              className={
                m.isInternal
                  ? "rounded-md border border-warning/30 bg-warning-soft p-5"
                  : "surface p-5"
              }
            >
              <header className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {m.author.firstName} {m.author.lastName}{" "}
                  <span className="text-xs text-muted-foreground">({m.author.role})</span>
                  {m.isInternal && (
                    <span className="ml-2 rounded bg-warning/20 px-2 py-0.5 text-xs uppercase text-warning">
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
                        className="font-medium text-primary hover:underline"
                      >
                        📎 {a.name} ({(a.size / 1024).toFixed(1)} KB)
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        {ticket.callerActions.canReply && (
          <SurfaceCard title="Reply">
            <ReplyForm
              id={ticket.id}
              locale={locale}
              showInternalToggle={ticket.callerActions.canSeeInternal}
            />
          </SurfaceCard>
        )}
      </div>
    </div>
  );
}
