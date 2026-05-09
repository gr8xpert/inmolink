"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { propertySchemas, type taxonomySchemas } from "@inmolink/shared";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { type CreatePropertyResult, createPropertyAction } from "./actions";

/**
 * Property create form. RHF + Zod resolver. Locale tabs (en required;
 * es/de/fr optional, dropped on submit if title+description empty).
 *
 * - Price input is in major-units (e.g. EUR 250000); converted to cents
 *   on submit. The api takes BigInt cents per PLAN §10.
 * - Slug is auto-filled from title via the slugify helper as the user
 *   types — they can override.
 */

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

// Form-shape Zod: prices/coords as strings the user types; we map to numbers
// + cents on submit. RHF doesn't play well with z.coerce when fields can be
// blank, so we keep the form schema permissive and validate at submit time.
const formSchema = z.object({
  status: propertySchemas.propertyStatusSchema.default("DRAFT"),
  visibility: propertySchemas.propertyVisibilitySchema.default("SHARED"),
  transactionType: propertySchemas.transactionTypeSchema,
  priceMajor: z.string().min(1, "Required"),
  currency: z.string().length(3),
  priceType: propertySchemas.priceTypeSchema.default("fixed"),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  areaM2: z.string().optional(),
  plotM2: z.string().optional(),
  yearBuilt: z.string().optional(),
  propertyTypeId: z.string().min(1, "Required"),
  locationId: z.string().min(1, "Required"),
  addressLine: z.string().optional(),
  postcode: z.string().optional(),
  // One block per locale; en title/description required, others optional.
  translations: z.object({
    en: z.object({
      title: z.string().min(1, "Required"),
      description: z.string().min(1, "Required"),
      slug: z
        .string()
        .min(1)
        .regex(/^[a-z0-9-]+$/, "Lowercase a-z, 0-9, dashes"),
    }),
    es: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
    }),
    de: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
    }),
    fr: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
    }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

const STATUSES = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "WITHDRAWN"] as const;
const VISIBILITIES = ["PRIVATE", "SHARED", "PUBLIC"] as const;
const TRANSACTIONS = ["SALE", "RENT", "SHORT_TERM"] as const;
const PRICE_TYPES = ["fixed", "from", "poa"] as const;
const CURRENCIES = ["EUR", "USD", "GBP"] as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip combining marks (diacritics)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

type Props = {
  locale: string;
  propertyTypes: taxonomySchemas.PropertyTypeListItem[];
  locations: taxonomySchemas.LocationListItem[];
};

export function PropertyCreateForm({ locale, propertyTypes, locations }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Locale>("en");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      status: "DRAFT",
      visibility: "SHARED",
      transactionType: "SALE",
      priceMajor: "",
      currency: "EUR",
      priceType: "fixed",
      propertyTypeId: propertyTypes[0]?.id ?? "",
      locationId: locations[0]?.id ?? "",
      translations: {
        en: { title: "", description: "", slug: "" },
        es: { title: "", description: "", slug: "" },
        de: { title: "", description: "", slug: "" },
        fr: { title: "", description: "", slug: "" },
      },
    },
  });

  function onSubmit(values: FormValues) {
    setError(null);

    const priceMajorNum = Number(values.priceMajor.replace(/[\s,]/g, ""));
    if (!Number.isFinite(priceMajorNum) || priceMajorNum < 0) {
      setError("Invalid price");
      return;
    }
    const priceCents = Math.round(priceMajorNum * 100);

    const optInt = (s?: string): number | undefined => {
      if (!s || s.trim() === "") return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? Math.trunc(n) : undefined;
    };

    const translations: Array<{
      locale: Locale;
      title: string;
      description: string;
      slug: string;
    }> = [];
    for (const loc of LOCALES) {
      const block = values.translations[loc];
      const title = block.title?.trim() ?? "";
      const description = block.description?.trim() ?? "";
      if (loc === "en" || (title && description)) {
        const slug = block.slug && block.slug.length > 0 ? block.slug : slugify(title);
        translations.push({ locale: loc, title, description, slug });
      }
    }

    const payload = {
      status: values.status,
      visibility: values.visibility,
      transactionType: values.transactionType,
      priceCents,
      currency: values.currency.toUpperCase(),
      priceType: values.priceType,
      bedrooms: optInt(values.bedrooms),
      bathrooms: optInt(values.bathrooms),
      areaM2: optInt(values.areaM2),
      plotM2: optInt(values.plotM2),
      yearBuilt: optInt(values.yearBuilt),
      propertyTypeId: values.propertyTypeId,
      locationId: values.locationId,
      addressLine: values.addressLine || undefined,
      postcode: values.postcode || undefined,
      featureIds: [] as string[],
      translations,
    };

    // Final shape validation against the canonical create schema. Catches
    // anything the form-level schema let through (e.g. cents overflow).
    const parsed = propertySchemas.propertyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }

    startTransition(async () => {
      const res: CreatePropertyResult = await createPropertyAction(locale, parsed.data);
      // Success path redirects server-side. Error path returns here.
      if (!res.ok) setError(res.error);
    });
  }

  // Auto-slug whenever the user types a title (only if slug is empty).
  function onTitleChange(loc: Locale, value: string) {
    form.setValue(`translations.${loc}.title`, value);
    const slug = form.getValues(`translations.${loc}.slug`);
    if (!slug || slug.length === 0) {
      form.setValue(`translations.${loc}.slug`, slugify(value));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <Section title="Basics">
        <Field label="Transaction" error={form.formState.errors.transactionType?.message}>
          <select className="input" {...form.register("transactionType")}>
            {TRANSACTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" error={form.formState.errors.status?.message}>
          <select className="input" {...form.register("status")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Visibility" error={form.formState.errors.visibility?.message}>
          <select className="input" {...form.register("visibility")}>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Price" error={form.formState.errors.priceMajor?.message}>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="250000"
            {...form.register("priceMajor")}
          />
        </Field>

        <Field label="Currency">
          <select className="input" {...form.register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Price type">
          <select className="input" {...form.register("priceType")}>
            {PRICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Specs (all optional)">
        <Field label="Bedrooms">
          <input className="input" type="number" min={0} {...form.register("bedrooms")} />
        </Field>
        <Field label="Bathrooms">
          <input className="input" type="number" min={0} {...form.register("bathrooms")} />
        </Field>
        <Field label="Built area (m²)">
          <input className="input" type="number" min={0} {...form.register("areaM2")} />
        </Field>
        <Field label="Plot (m²)">
          <input className="input" type="number" min={0} {...form.register("plotM2")} />
        </Field>
        <Field label="Year built">
          <input
            className="input"
            type="number"
            min={1800}
            max={2100}
            {...form.register("yearBuilt")}
          />
        </Field>
      </Section>

      <Section title="Type & location">
        <Field label="Property type" error={form.formState.errors.propertyTypeId?.message}>
          <select className="input" {...form.register("propertyTypeId")}>
            {propertyTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location" error={form.formState.errors.locationId?.message}>
          <select className="input" {...form.register("locationId")}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.countryCode} · {l.name} ({l.level})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Address line (optional)">
          <input className="input" type="text" {...form.register("addressLine")} />
        </Field>
        <Field label="Postcode (optional)">
          <input className="input" type="text" {...form.register("postcode")} />
        </Field>
      </Section>

      <Section title="Content (per locale)">
        <div className="col-span-full space-y-4">
          <div role="tablist" className="flex gap-1 border-b">
            {LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                role="tab"
                aria-selected={activeTab === loc}
                onClick={() => setActiveTab(loc)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  activeTab === loc
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {loc.toUpperCase()}
                {loc === "en" && <span className="ml-1 text-red-500">*</span>}
              </button>
            ))}
          </div>

          {LOCALES.map((loc) => (
            <div key={loc} hidden={activeTab !== loc} className="space-y-3">
              <Field
                label="Title"
                error={form.formState.errors.translations?.[loc]?.title?.message}
              >
                <Controller
                  name={`translations.${loc}.title`}
                  control={form.control}
                  render={({ field }) => (
                    <input
                      className="input"
                      type="text"
                      value={field.value ?? ""}
                      onChange={(e) => onTitleChange(loc, e.target.value)}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>

              <Field label="Slug" error={form.formState.errors.translations?.[loc]?.slug?.message}>
                <input
                  className="input"
                  type="text"
                  placeholder="auto-generated from title"
                  {...form.register(`translations.${loc}.slug`)}
                />
              </Field>

              <Field
                label="Description"
                error={form.formState.errors.translations?.[loc]?.description?.message}
              >
                <textarea
                  className="input min-h-[120px]"
                  {...form.register(`translations.${loc}.description`)}
                />
              </Field>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create property"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input is rendered inside `children`
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
