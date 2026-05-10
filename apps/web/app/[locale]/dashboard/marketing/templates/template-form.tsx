"use client";

import { useActionState } from "react";
import { createTemplateAction } from "./actions";

export function TemplateForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createTemplateAction, null);
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
          placeholder="Hi {{contact.firstName}}!"
          className="input mt-1 w-full"
        />
      </label>
      <label className="block text-xs">
        Body (HTML)
        <textarea
          name="bodyHtml"
          required
          rows={10}
          placeholder='<p>Hi {{contact.firstName}}!</p><p>Check out our new listing: <a href="{{property.url}}">{{property.title}}</a>.</p>'
          className="input mt-1 w-full font-mono text-xs"
        />
      </label>
      <label className="block text-xs">
        Body (plain text — optional)
        <textarea name="bodyText" rows={4} className="input mt-1 w-full" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Save template"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700">Saved.</p>}
    </form>
  );
}
