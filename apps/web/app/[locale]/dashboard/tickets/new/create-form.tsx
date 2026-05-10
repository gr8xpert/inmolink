"use client";

import { useActionState } from "react";
import { createTicketAction } from "../actions";

export function TicketCreateForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createTicketAction, null);
  return (
    <form action={action} className="space-y-4 rounded-md border bg-background p-4 shadow-sm">
      <input type="hidden" name="locale" value={locale} />
      <label className="block text-xs">
        Subject *
        <input
          name="subject"
          required
          minLength={3}
          maxLength={255}
          className="input mt-1 w-full"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Category
          <select name="category" defaultValue="OTHER" className="input mt-1 w-full">
            <option value="BUG">Bug</option>
            <option value="FEATURE_REQUEST">Feature request</option>
            <option value="BILLING">Billing</option>
            <option value="ACCOUNT">Account</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="text-xs">
          Priority
          <select name="priority" defaultValue="NORMAL" className="input mt-1 w-full">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
      </div>
      <label className="block text-xs">
        Body *
        <textarea
          name="body"
          required
          rows={8}
          minLength={1}
          maxLength={10_000}
          className="input mt-1 w-full"
          placeholder="What happened? Include steps to reproduce if it's a bug."
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Open ticket"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
