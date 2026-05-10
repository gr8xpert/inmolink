"use client";

import { useActionState, useState } from "react";
import { createExportAction } from "./actions";

export function ExportCreateForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createExportAction, null);
  const [kind, setKind] = useState<"CSV" | "PDF_PROPERTY" | "PDF_PORTFOLIO">("CSV");
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Kind
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="input mt-1 w-full"
          >
            <option value="CSV">CSV (whole inventory)</option>
            <option value="PDF_PROPERTY">PDF brochure (single property)</option>
            <option value="PDF_PORTFOLIO">PDF portfolio (many properties)</option>
          </select>
        </label>
        <label className="text-xs">
          Locale
          <select name="locale" defaultValue={locale} className="input mt-1 w-full">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
          </select>
        </label>
      </div>
      <label className="block text-xs">
        Property IDs (comma-separated; required for PDF brochure)
        <input
          name="propertyIds"
          placeholder="cl0123…, cl0456…"
          className="input mt-1 w-full"
          required={kind === "PDF_PROPERTY"}
        />
      </label>
      {kind !== "PDF_PROPERTY" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            Status
            <select name="status" defaultValue="" className="input mt-1 w-full">
              <option value="">Any</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="SOLD">Sold</option>
            </select>
          </label>
          <label className="text-xs">
            Visibility
            <select name="visibility" defaultValue="" className="input mt-1 w-full">
              <option value="">Any</option>
              <option value="PRIVATE">Private</option>
              <option value="SHARED">Shared</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>
          <label className="text-xs">
            Property type ID
            <input name="propertyTypeId" className="input mt-1 w-full" />
          </label>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Queueing…" : "Queue export"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && (
        <p className="text-xs text-emerald-700">Queued — refresh to see status updates.</p>
      )}
    </form>
  );
}
