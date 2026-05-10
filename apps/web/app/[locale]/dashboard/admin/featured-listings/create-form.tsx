"use client";

import { useActionState } from "react";
import { createFeaturedAction } from "./actions";

export function CreateFeaturedForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createFeaturedAction, null);
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
          Starts at
          <input name="startsAt" type="datetime-local" required className="input mt-1 w-full" />
        </label>
        <label className="text-xs">
          Ends at
          <input name="endsAt" type="datetime-local" required className="input mt-1 w-full" />
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
