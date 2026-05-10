"use client";

import { useActionState } from "react";
import { createContactAction } from "./actions";

export function ContactForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createContactAction, null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          Email *
          <input name="email" type="email" required className="input mt-1 w-full" />
        </label>
        <label className="text-xs">
          First name
          <input name="firstName" className="input mt-1 w-full" />
        </label>
        <label className="text-xs">
          Last name
          <input name="lastName" className="input mt-1 w-full" />
        </label>
      </div>
      <label className="block text-xs">
        Tags (comma-separated)
        <input name="tags" placeholder="vip, malaga, beach" className="input mt-1 w-full" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="consentGiven" />
        Marketing consent given
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Add"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700">Added.</p>}
    </form>
  );
}
