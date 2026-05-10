"use client";

import type { taxonomySchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * Search filter bar. Submits via GET so the URL is the source of truth
 * for filter state — back/forward + sharing both work without ceremony.
 *
 * The form is uncontrolled until submit; we only swap to controlled
 * state for the price + bedrooms numeric inputs so the user sees the
 * value they typed even if it's not a number yet.
 */

type Initial = {
  transactionType: string;
  propertyTypeId: string;
  locationId: string;
  minPriceCents: string;
  maxPriceCents: string;
  bedrooms: string;
  q: string;
  featureIds: string[];
};

type Props = {
  locale: string;
  propertyTypes: taxonomySchemas.PropertyTypeListItem[];
  locations: taxonomySchemas.LocationListItem[];
  features: taxonomySchemas.FeatureListItem[];
  initial: Initial;
};

type ScalarKey = Exclude<keyof Initial, "featureIds">;

export function SearchFilters({ locale, propertyTypes, locations, features, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Initial>(initial);

  function set(key: ScalarKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleFeature(id: string) {
    setValues((v) => {
      const has = v.featureIds.includes(id);
      return {
        ...v,
        featureIds: has ? v.featureIds.filter((x) => x !== id) : [...v.featureIds, id],
      };
    });
  }

  // Group features by groupId for the rendered checkboxes — public api
  // already returns them in (group.position, feature.position) order, so
  // we just preserve insertion order in a Map.
  const groupedFeatures = useMemo(() => {
    const m = new Map<string, { name: string; items: typeof features }>();
    for (const f of features) {
      const g = m.get(f.groupId);
      if (g) g.items.push(f);
      else m.set(f.groupId, { name: f.groupName, items: [f] });
    }
    return Array.from(m.values());
  }, [features]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) {
      if (k === "featureIds") {
        for (const id of values.featureIds) qs.append("featureIds", id);
      } else if (typeof v === "string" && v.length > 0) {
        qs.set(k, v);
      }
    }
    // Cursor is reset on every filter change — old cursor is meaningless
    // against a different filter set.
    const path = `/${locale}/search${qs.toString() ? `?${qs.toString()}` : ""}`;
    router.push(path);
  }

  function onReset() {
    setValues({
      transactionType: "",
      propertyTypeId: "",
      locationId: "",
      minPriceCents: "",
      maxPriceCents: "",
      bedrooms: "",
      q: "",
      featureIds: [],
    });
    router.push(`/${locale}/search`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Field label="Search">
        <input
          type="search"
          value={values.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Sea view, mountain, terrace…"
          className="search-input"
        />
      </Field>

      <Field label="Transaction">
        <select
          value={values.transactionType}
          onChange={(e) => set("transactionType", e.target.value)}
          className="search-input"
        >
          <option value="">Any</option>
          <option value="SALE">For sale</option>
          <option value="RENT">Long-term rental</option>
          <option value="SHORT_TERM">Short-term rental</option>
        </select>
      </Field>

      <Field label="Property type">
        <select
          value={values.propertyTypeId}
          onChange={(e) => set("propertyTypeId", e.target.value)}
          className="search-input"
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
          value={values.locationId}
          onChange={(e) => set("locationId", e.target.value)}
          className="search-input"
        >
          <option value="">Anywhere</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.countryCode} · {l.name} ({l.level})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Min price (€)">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={values.minPriceCents ? Number(values.minPriceCents) / 100 : ""}
          onChange={(e) =>
            set("minPriceCents", e.target.value === "" ? "" : String(Number(e.target.value) * 100))
          }
          placeholder="0"
          className="search-input"
        />
      </Field>

      <Field label="Max price (€)">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={values.maxPriceCents ? Number(values.maxPriceCents) / 100 : ""}
          onChange={(e) =>
            set("maxPriceCents", e.target.value === "" ? "" : String(Number(e.target.value) * 100))
          }
          placeholder="No max"
          className="search-input"
        />
      </Field>

      <Field label="Min bedrooms">
        <select
          value={values.bedrooms}
          onChange={(e) => set("bedrooms", e.target.value)}
          className="search-input"
        >
          <option value="">Any</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
          <option value="5">5+</option>
        </select>
      </Field>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
        >
          Reset
        </button>
      </div>

      {groupedFeatures.length > 0 && (
        <details className="sm:col-span-2 lg:col-span-4" open={values.featureIds.length > 0}>
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Amenities
            {values.featureIds.length > 0 && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {values.featureIds.length}
              </span>
            )}
          </summary>
          <div className="mt-3 space-y-3">
            {groupedFeatures.map((g) => (
              <fieldset key={g.name} className="space-y-1">
                <legend className="text-xs font-semibold text-muted-foreground">{g.name}</legend>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((f) => {
                    const checked = values.featureIds.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                          checked
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleFeature(f.id)}
                        />
                        {f.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </details>
      )}
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
