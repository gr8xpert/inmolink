"use client";

import { useActionState } from "react";
import { createFeaturedAction } from "./actions";

/** YYYY-MM-DD for the native <input type="date"> default value. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CreateFeaturedForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createFeaturedAction, null);
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Property ID
          <input name="propertyId" required className="input mt-1 w-full" />
        </label>
        <label className="text-xs">
          Surface
          <select name="surface" defaultValue="PUBLIC_HOME" className="input mt-1 w-full">
            <option value="PUBLIC_HOME">Public home</option>
            <option value="LOCATION_PAGE">Location page</option>
            <option value="SEARCH_TOP">Search top</option>
            <option value="AGENCY_PROFILE_TOP">Agency profile top</option>
          </select>
        </label>
        <label className="text-xs">
          Starts on
          <input
            name="startsAt"
            type="date"
            required
            defaultValue={isoDate(today)}
            className="input mt-1 w-full"
          />
        </label>
        <label className="text-xs">
          Ends on
          <input
            name="endsAt"
            type="date"
            required
            defaultValue={isoDate(in30Days)}
            className="input mt-1 w-full"
          />
        </label>
        <label className="text-xs">
          Position
          <input name="position" type="number" defaultValue={0} className="input mt-1 w-full" />
        </label>
      </div>
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
