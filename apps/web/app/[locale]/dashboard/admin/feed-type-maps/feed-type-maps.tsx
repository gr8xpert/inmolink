"use client";

import type { adminFeedTypeMapSchemas, taxonomySchemas } from "@inmolink/shared";
import { useState, useTransition } from "react";
import { createMapAction, deleteMapAction, updateMapAction } from "./actions";

type Props = {
  locale: string;
  initialMaps: adminFeedTypeMapSchemas.AdminFeedTypeMap[];
  types: taxonomySchemas.PropertyTypeListItem[];
};

const KINDS = ["KYERO", "RESALE_ONLINE", "GENERIC_XML"] as const;

export function FeedTypeMaps({ locale, initialMaps, types }: Props) {
  const [maps, setMaps] = useState(initialMaps);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [formKind, setFormKind] = useState<(typeof KINDS)[number]>("KYERO");
  const [formLabel, setFormLabel] = useState("");
  const [formTypeId, setFormTypeId] = useState(types[0]?.id ?? "");

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!formLabel.trim() || !formTypeId) {
      setError("Both label and property type are required.");
      return;
    }
    start(async () => {
      const r = await createMapAction(locale, {
        kind: formKind,
        sourceLabel: formLabel,
        propertyTypeId: formTypeId,
      });
      if (r.ok) {
        setMaps((prev) =>
          [...prev, r.data].sort((a, b) =>
            a.kind === b.kind
              ? a.sourceLabel.localeCompare(b.sourceLabel)
              : a.kind.localeCompare(b.kind),
          ),
        );
        setFormLabel("");
      } else {
        setError(r.error);
      }
    });
  }

  function onChangeType(id: string, propertyTypeId: string) {
    setError(null);
    start(async () => {
      const r = await updateMapAction(locale, id, { propertyTypeId });
      if (r.ok) setMaps((prev) => prev.map((m) => (m.id === id ? r.data : m)));
      else setError(r.error);
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this mapping? Future imports will fall back to translation match."))
      return;
    setError(null);
    start(async () => {
      const r = await deleteMapAction(locale, id);
      if (r.ok) setMaps((prev) => prev.filter((m) => m.id !== id));
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Add mapping</h2>
        <form
          onSubmit={onCreate}
          className="mt-3 grid gap-3 sm:grid-cols-[140px,1fr,1fr,auto] items-end"
        >
          <label className="block text-sm">
            <span className="block text-muted-foreground">Connector</span>
            <select
              value={formKind}
              onChange={(e) => setFormKind(e.target.value as (typeof KINDS)[number])}
              className="input mt-1 w-full"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Source label</span>
            <input
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              className="input mt-1 w-full font-mono"
              placeholder="Townhouse"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Property type</span>
            <select
              value={formTypeId}
              onChange={(e) => setFormTypeId(e.target.value)}
              className="input mt-1 w-full"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Existing mappings ({maps.length})</h2>
        {maps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mappings yet. Imports will use translation-name fallback for now.
          </p>
        ) : (
          <ul className="divide-y rounded-md border bg-background shadow-sm">
            {maps.map((m) => (
              <li
                key={m.id}
                className="grid items-center gap-3 p-3 sm:grid-cols-[120px,1fr,1fr,auto]"
              >
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{m.kind}</span>
                <span className="font-mono text-sm">{m.sourceLabel}</span>
                <select
                  value={m.propertyTypeId}
                  onChange={(e) => onChangeType(m.id, e.target.value)}
                  disabled={pending}
                  className="input"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  disabled={pending}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
