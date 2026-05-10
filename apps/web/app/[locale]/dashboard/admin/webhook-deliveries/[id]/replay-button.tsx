"use client";

import { useActionState } from "react";
import { replayDeliveryAction } from "../actions";

export function ReplayButton({ id, locale }: { id: string; locale: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, formData: FormData) =>
      replayDeliveryAction(formData),
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {pending ? "…" : "Replay delivery"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-1 text-xs text-emerald-700">Re-enqueued.</p>}
    </form>
  );
}
