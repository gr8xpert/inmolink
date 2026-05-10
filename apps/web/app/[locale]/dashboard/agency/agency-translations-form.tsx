"use client";

import { type agencySchemas, agencySchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { saveAgencyTranslationsAction } from "./actions";

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

type Props = { locale: string; initial: agencySchemas.AgencyDetail };

type Form = Record<Locale, { description: string; metaTitle: string; metaDescription: string }>;

export function AgencyTranslationsForm({ locale, initial }: Props) {
  const t = useTranslations("agency.translations");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Locale>("en");

  const initialByLocale = new Map(initial.translations.map((t) => [t.locale, t]));
  const defaults: Form = LOCALES.reduce<Form>((acc, l) => {
    const t = initialByLocale.get(l);
    acc[l] = {
      description: t?.description ?? "",
      metaTitle: t?.metaTitle ?? "",
      metaDescription: t?.metaDescription ?? "",
    };
    return acc;
  }, {} as Form);

  const { register, handleSubmit } = useForm<Form>({ defaultValues: defaults });

  function onSubmit(data: Form) {
    setServerError(null);
    setSavedAt(null);
    const translations = LOCALES.flatMap((l) => {
      const v = data[l];
      const description = v.description.trim();
      const metaTitle = v.metaTitle.trim();
      const metaDescription = v.metaDescription.trim();
      // Drop locales that have nothing meaningful to save.
      if (description === "" && metaTitle === "" && metaDescription === "") return [];
      return [
        {
          locale: l,
          description: description === "" ? null : description,
          metaTitle: metaTitle === "" ? null : metaTitle,
          metaDescription: metaDescription === "" ? null : metaDescription,
        },
      ];
    });
    const parsed = schemas.agencyTranslationsUpdateSchema.safeParse({ translations });
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await saveAgencyTranslationsAction(locale, parsed.data);
      if (res.ok) setSavedAt(Date.now());
      else setServerError(res.error);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex gap-2 border-b">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setActiveTab(l)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              activeTab === l
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {LOCALES.map((l) => (
        <div key={l} className={`space-y-3 ${activeTab === l ? "" : "hidden"}`}>
          <Field label={t("description")}>
            <textarea className="input min-h-[140px]" rows={6} {...register(`${l}.description`)} />
          </Field>
          <Field label={t("metaTitle")}>
            <input className="input" maxLength={70} {...register(`${l}.metaTitle`)} />
          </Field>
          <Field label={t("metaDescription")}>
            <textarea
              className="input min-h-[60px]"
              rows={2}
              maxLength={160}
              {...register(`${l}.metaDescription`)}
            />
          </Field>
        </div>
      ))}

      {serverError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          {serverError}
        </p>
      )}
      {savedAt && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-700">
          {t("saved")}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input passed via children — implicit HTML5 association still works.
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
