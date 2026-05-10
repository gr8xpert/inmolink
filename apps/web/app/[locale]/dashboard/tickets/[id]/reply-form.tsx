"use client";

import { useActionState } from "react";
import { replyTicketAction } from "../actions";

type Props = {
  id: string;
  locale: string;
  showInternalToggle: boolean;
};

export function ReplyForm({ id, locale, showInternalToggle }: Props) {
  const [state, action, pending] = useActionState(replyTicketAction, null);
  return (
    <form action={action} className="space-y-3 rounded-md border bg-background p-4 shadow-sm">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <textarea
        name="body"
        required
        rows={5}
        minLength={1}
        maxLength={10_000}
        placeholder="Type your reply…"
        className="input w-full"
      />
      <div className="flex items-center justify-between">
        {showInternalToggle ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="isInternal" />
            Internal note (only visible to super-admins)
          </label>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Reply"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700">Sent.</p>}
    </form>
  );
}
