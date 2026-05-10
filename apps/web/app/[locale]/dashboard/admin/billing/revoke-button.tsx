"use client";

import { useActionState } from "react";
import { revokeGrantAction } from "./actions";

export function RevokeButton({ agencyId, locale }: { agencyId: string; locale: string }) {
  const [state, action, pending] = useActionState(revokeGrantAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="agencyId" value={agencyId} />
      <input type="hidden" name="locale" value={locale} />
      <input
        type="text"
        name="reason"
        placeholder="Optional revoke reason"
        className="input mb-1 w-48 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Revoke this manual grant? Tier reverts to FREE.")) e.preventDefault();
        }}
        className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100 disabled:opacity-50"
      >
        {pending ? "…" : "Revoke"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
