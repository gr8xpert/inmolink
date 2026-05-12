"use client";

import type { taxonomySchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Dashboard property list filter bar. Mirrors the public marketplace
 * search filters (apps/public/.../search-filters.tsx) but with the
 * dashboard-only fields (status / visibility) and without price/beds
 * — agents typically filter by status while curating, not by price.
 *
 * URL is the source of truth for filter state. Submit pushes a new
 * path; the Server Component re-renders with fresh data via apiFetch.
 */

type Initial = {
  q: string;
  status: string;
  visibility: string;
  transactionType: string;
  propertyTypeId: string;
  locationId: string;
};

type Props = {
  locale: string;
  propertyTypes: taxonomySchemas.PropertyTypeListItem[];
  locations: taxonomySchemas.LocationListItem[];
  initial: Initial;
};

export function PropertyFilters({ locale, propertyTypes, locations, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Initial>(initial);

  function set<K extends keyof Initial>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) {
      if (v && v.length > 0) qs.set(k, v);
    }
    // Cursor is reset on every filter change — old cursor is meaningless
    // against a different filter set.
    const path = `/${locale}/dashboard/properties${qs.toString() ? `?${qs.toString()}` : ""}`;
    router.push(path);
  }

  function onReset() {
    setValues({
      q: "",
      status: "",
      visibility: "",
      transactionType: "",
      propertyTypeId: "",
      locationId: "",
    });
    router.push(`/${locale}/dashboard/properties`);
  }

  const activeCount = Object.values(values).filter((v) => v.length > 0).length;

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="Search">
        <input
          type="search"
          value={values.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Title, description…"
          className="input"
        />
      </Field>

      <Field label="Status">
        <select
          className="input"
          value={values.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">Any</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="UNDER_OFFER">Under offer</option>
          <option value="SOLD">Sold</option>
          <option value="RENTED">Rented</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
      </Field>

      <Field label="Visibility">
        <select
          className="input"
          value={values.visibility}
          onChange={(e) => set("visibility", e.target.value)}
        >
          <option value="">Any</option>
          <option value="PRIVATE">Private</option>
          <option value="SHARED">Shared</option>
          <option value="PUBLIC">Public</option>
        </select>
      </Field>

      <Field label="Transaction">
        <select
          className="input"
          value={values.transactionType}
          onChange={(e) => set("transactionType", e.target.value)}
        >
          <option value="">Any</option>
          <option value="SALE">For sale</option>
          <option value="RENT">Long-term rental</option>
          <option value="SHORT_TERM">Short-term rental</option>
        </select>
      </Field>

      <Field label="Property type">
        <select
          className="input"
          value={values.propertyTypeId}
          onChange={(e) => set("propertyTypeId", e.target.value)}
        >
          <option value="">Any</option>
          {propertyTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Location">
        <select
          className="input"
          value={values.locationId}
          onChange={(e) => set("locationId", e.target.value)}
        >
          <option value="">Anywhere</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.level.toLowerCase()})
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-end gap-2 lg:col-start-3">
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          Apply{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={activeCount === 0}
          className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input is rendered inside `children`
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
