"use client";

import { type meSchemas, meSchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { savePreferencesAction } from "./actions";

type Props = { locale: string; initial: meSchemas.UserSettingsT };

const LOCALES = ["en", "es", "de", "fr"] as const;
const FREQUENCIES = ["INSTANT", "DAILY", "WEEKLY"] as const;

export function PreferencesForm({ locale, initial }: Props) {
  const t = useTranslations("settings.preferences");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { register, handleSubmit } = useForm<meSchemas.UserSettingsT>({
    defaultValues: initial,
  });

  function onSubmit(data: meSchemas.UserSettingsT) {
    setServerError(null);
    setSavedAt(null);
    const parsed = schemas.userSettingsSchema.safeParse(data);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await savePreferencesAction(locale, parsed.data);
      if (res.ok) setSavedAt(Date.now());
      else setServerError(res.error);
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("preferredLocale")}</legend>
        <select className="input" {...register("preferredLocale")}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t(`locales.${l}`)}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("emailDigestFrequency")}</legend>
        <select className="input" {...register("emailDigestFrequency")}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(`frequencies.${f}`)}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">{t("notifications")}</legend>
        <Toggle label={t("notifyOnViewingRequest")} {...register("notifyOnViewingRequest")} />
        <Toggle label={t("notifyOnChatMessage")} {...register("notifyOnChatMessage")} />
        <Toggle label={t("notifyOnLead")} {...register("notifyOnLead")} />
        <Toggle label={t("notifyOnDealEvent")} {...register("notifyOnDealEvent")} />
        <Toggle label={t("notifyOnImportFailure")} {...register("notifyOnImportFailure")} />
      </fieldset>

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

const Toggle = function Toggle({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
};
