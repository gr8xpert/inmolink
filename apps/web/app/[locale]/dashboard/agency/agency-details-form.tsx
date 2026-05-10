"use client";

import { type agencySchemas, agencySchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { saveAgencyDetailsAction } from "./actions";

type Props = { locale: string; initial: agencySchemas.AgencyDetail };

type Form = {
  name: string;
  slug: string;
  email: string;
  phone: string;
  website: string;
  whatsappNumber: string;
  socialFacebook: string;
  socialInstagram: string;
  socialLinkedin: string;
  socialTwitter: string;
  countryCode: string;
  isPublic: boolean;
};

export function AgencyDetailsForm({ locale, initial }: Props) {
  const t = useTranslations("agency.details");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: {
      name: initial.name,
      slug: initial.slug,
      email: initial.email ?? "",
      phone: initial.phone ?? "",
      website: initial.website ?? "",
      whatsappNumber: initial.whatsappNumber ?? "",
      socialFacebook: initial.socialFacebook ?? "",
      socialInstagram: initial.socialInstagram ?? "",
      socialLinkedin: initial.socialLinkedin ?? "",
      socialTwitter: initial.socialTwitter ?? "",
      countryCode: initial.countryCode,
      isPublic: initial.isPublic,
    },
  });

  function onSubmit(data: Form) {
    setServerError(null);
    setSavedAt(null);
    const payload = {
      name: data.name.trim(),
      slug: data.slug.trim(),
      email: data.email.trim() === "" ? null : data.email.trim(),
      phone: data.phone.trim() === "" ? null : data.phone.trim(),
      website: data.website.trim() === "" ? null : data.website.trim(),
      whatsappNumber: data.whatsappNumber.trim() === "" ? null : data.whatsappNumber.trim(),
      socialFacebook: data.socialFacebook.trim() === "" ? null : data.socialFacebook.trim(),
      socialInstagram: data.socialInstagram.trim() === "" ? null : data.socialInstagram.trim(),
      socialLinkedin: data.socialLinkedin.trim() === "" ? null : data.socialLinkedin.trim(),
      socialTwitter: data.socialTwitter.trim() === "" ? null : data.socialTwitter.trim(),
      countryCode: data.countryCode.trim().toUpperCase(),
      isPublic: data.isPublic,
    };
    const parsed = schemas.agencyDetailsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await saveAgencyDetailsAction(locale, parsed.data);
      if (res.ok) setSavedAt(Date.now());
      else setServerError(res.error);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={formState.errors.name?.message}>
          <input className="input" {...register("name", { required: true })} />
        </Field>
        <Field label={t("slug")} hint={t("slugHint")} error={formState.errors.slug?.message}>
          <input className="input" {...register("slug", { required: true })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("email")}>
          <input className="input" type="email" {...register("email")} />
        </Field>
        <Field label={t("phone")}>
          <input className="input" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label={t("website")}>
          <input className="input" type="url" {...register("website")} />
        </Field>
        <Field label={t("whatsapp")}>
          <input className="input" inputMode="tel" {...register("whatsappNumber")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("socialFacebook")}>
          <input className="input" type="url" {...register("socialFacebook")} />
        </Field>
        <Field label={t("socialInstagram")}>
          <input className="input" type="url" {...register("socialInstagram")} />
        </Field>
        <Field label={t("socialLinkedin")}>
          <input className="input" type="url" {...register("socialLinkedin")} />
        </Field>
        <Field label={t("socialTwitter")}>
          <input className="input" type="url" {...register("socialTwitter")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("countryCode")}>
          <input
            className="input uppercase"
            maxLength={2}
            {...register("countryCode", { required: true })}
          />
        </Field>
        <label className="flex items-end gap-3 text-sm">
          <input type="checkbox" {...register("isPublic")} />
          <span>{t("isPublic")}</span>
        </label>
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

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input passed via children — implicit HTML5 association still works.
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}
