"use client";

import { type agencySchemas, agencySchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { saveAgencySettingsAction } from "./actions";

type Props = { locale: string; initial: agencySchemas.AgencyDetail };

type Form = {
  defaultCommissionPct: string;
  defaultIntroducerSharePct: string;
  viewingResponseDays: string;
  dealConfirmationDays: string;
};

export function AgencySettingsForm({ locale, initial }: Props) {
  const t = useTranslations("agency.settings");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { register, handleSubmit } = useForm<Form>({
    defaultValues: {
      defaultCommissionPct: String(initial.settings.defaultCommissionPct),
      defaultIntroducerSharePct: String(initial.settings.defaultIntroducerSharePct),
      viewingResponseDays: String(initial.settings.viewingResponseDays),
      dealConfirmationDays: String(initial.settings.dealConfirmationDays),
    },
  });

  function onSubmit(data: Form) {
    setServerError(null);
    setSavedAt(null);
    const payload = {
      defaultCommissionPct: Number(data.defaultCommissionPct),
      defaultIntroducerSharePct: Number(data.defaultIntroducerSharePct),
      viewingResponseDays: Number.parseInt(data.viewingResponseDays, 10),
      dealConfirmationDays: Number.parseInt(data.dealConfirmationDays, 10),
    };
    const parsed = schemas.agencySettingsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await saveAgencySettingsAction(locale, parsed.data);
      if (res.ok) setSavedAt(Date.now());
      else setServerError(res.error);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("defaultCommissionPct")}>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            max={100}
            {...register("defaultCommissionPct")}
          />
        </Field>
        <Field label={t("defaultIntroducerSharePct")}>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            max={100}
            {...register("defaultIntroducerSharePct")}
          />
        </Field>
        <Field label={t("viewingResponseDays")}>
          <input
            className="input"
            type="number"
            min={1}
            max={60}
            {...register("viewingResponseDays")}
          />
        </Field>
        <Field label={t("dealConfirmationDays")}>
          <input
            className="input"
            type="number"
            min={1}
            max={120}
            {...register("dealConfirmationDays")}
          />
        </Field>
      </div>

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
