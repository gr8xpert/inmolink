"use client";

import { useActionState } from "react";
import { createCampaignAction } from "./actions";

export function CampaignForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createCampaignAction, null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <label className="block text-xs">
        Name
        <input name="name" required maxLength={255} className="input mt-1 w-full" />
      </label>
      <label className="block text-xs">
        Subject
        <input
          name="subject"
          required
          maxLength={255}
          placeholder="New listings this week"
          className="input mt-1 w-full"
        />
      </label>
      <label className="block text-xs">
        Body (HTML)
        <textarea
          name="bodyHtml"
          required
          rows={8}
          className="input mt-1 w-full font-mono text-xs"
        />
      </label>
      <label className="block text-xs">
        Body (plain text — optional)
        <textarea name="bodyText" rows={3} className="input mt-1 w-full" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          Audience source
          <select name="source" defaultValue="contacts" className="input mt-1 w-full">
            <option value="contacts">Contacts</option>
            <option value="leads">Leads</option>
          </select>
        </label>
        <label className="block text-xs">
          Filter by tags (comma-separated; contacts only)
          <input name="tags" className="input mt-1 w-full" placeholder="vip, malaga" />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Save draft"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700">Saved.</p>}
    </form>
  );
}
