import type { ticketSchemas } from "@inmolink/shared";
import { changeStatusAction } from "../actions";

type Props = {
  id: string;
  status: ticketSchemas.TicketStatus;
  locale: string;
};

const TARGETS: Array<{
  to: ticketSchemas.TicketStatus;
  label: string;
  from: ticketSchemas.TicketStatus[];
}> = [
  { to: "IN_PROGRESS", label: "Mark in-progress", from: ["OPEN"] },
  { to: "RESOLVED", label: "Resolve", from: ["OPEN", "IN_PROGRESS"] },
  { to: "CLOSED", label: "Close", from: ["RESOLVED", "IN_PROGRESS", "OPEN"] },
  { to: "OPEN", label: "Reopen", from: ["RESOLVED", "CLOSED"] },
];

export function StatusButtons({ id, status, locale }: Props) {
  const visible = TARGETS.filter((t) => t.from.includes(status));
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((t) => (
        <form key={t.to} action={changeStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={t.to} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
