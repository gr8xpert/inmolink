"use client";

import { useActionState } from "react";
import { addSuppressionAction } from "./actions";

export function AddSuppressionForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(addSuppressionAction, null);
  return (
    <form action={action} className="mt-3 flex gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input
        name="email"
        type="email"
        required
        placeholder="user@example.com"
        className="input flex-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Add"}
      </button>
      {state?.error && <p className="ml-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
