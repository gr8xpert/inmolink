"use client";

import { useActionState } from "react";
import { grantPlanAction } from "./actions";

export function GrantForm({ agencyId, locale }: { agencyId: string; locale: string }) {
  const [state, action, pending] = useActionState(grantPlanAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="agencyId" value={agencyId} />
      <input type="hidden" name="locale" value={locale} />
      <label className="block text-xs">
        Tier
        <select name="planTier" defaultValue="PRO" className="input mt-1 w-full">
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
        </select>
      </label>
      <label className="block text-xs">
        Expires at (optional)
        <input type="date" name="grantedUntil" className="input mt-1 w-full" />
      </label>
      <label className="block text-xs">
        Reason
        <input
          type="text"
          name="grantedReason"
          required
          minLength={1}
          maxLength={500}
          className="input mt-1 w-full"
          placeholder="Pilot agency / promo / support credit"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Apply grant"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-700">Granted.</p>}
    </form>
  );
}
