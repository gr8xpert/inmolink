"use client";

import { feedImportSchemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updatePropertyAction } from "./actions";

type Props = {
  locale: string;
  propertyId: string;
  source: string;
  initialLocked: string[];
};

const LOCKABLE_FIELDS = feedImportSchemas.lockableFieldSchema.options;

/**
 * Field-level lock editor (PLAN row 16). Only rendered for properties
 * whose `source` isn't `MANUAL` — otherwise locks have no effect since
 * the connector never updates the property.
 *
 * Persists via PATCH /api/dashboard/properties/:id { lockedFields }.
 * The api keeps `lockedFields` as a JSON string array; the worker
 * consults it before each field-update branch on every re-import.
 */
export function FieldLocksManager(props: Props) {
  const t = useTranslations("imports.locks");
  const [locked, setLocked] = useState(new Set(props.initialLocked));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  function toggle(field: string) {
    const next = new Set(locked);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setLocked(next);
  }

  function onSave() {
    setError(null);
    start(async () => {
      const r = await updatePropertyAction(props.locale, props.propertyId, {
        lockedFields: Array.from(locked),
      });
      if (r.ok) {
        setSaved(Date.now());
      } else {
        setError(r.error);
      }
    });
  }

  if (props.source === "MANUAL") return null;

  return (
    <section className="rounded-md border bg-background p-6 shadow-sm space-y-3">
      <header>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle", { source: props.source })}</p>
      </header>
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && <p className="rounded-md bg-green-50 p-3 text-sm text-green-900">{t("saved")}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LOCKABLE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={locked.has(field)}
              onChange={() => toggle(field)}
              disabled={pending}
            />
            <span className="font-mono text-xs">{field}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end pt-2 border-t">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </section>
  );
}
