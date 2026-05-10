"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type meSchemas, meSchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { saveProfileAction } from "./actions";

type Props = {
  locale: string;
  initial: meSchemas.MeDetail;
};

type Form = {
  firstName: string;
  lastName: string;
  slug: string;
  phone: string;
  whatsappNumber: string;
  bio: string;
  languagesSpokenCsv: string;
  publicProfileEnabled: boolean;
};

export function ProfileForm({ locale, initial }: Props) {
  const t = useTranslations("settings.profile");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { register, handleSubmit, formState } = useForm<Form>({
    // Inline-validate the parts schemas.profileSchema also validates so
    // server-side errors mostly correspond to slug-uniqueness collisions.
    resolver: zodResolver(
      schemas.profileSchema.pick({
        firstName: true,
        lastName: true,
        slug: true,
        publicProfileEnabled: true,
      }),
    ),
    defaultValues: {
      firstName: initial.profile.firstName,
      lastName: initial.profile.lastName,
      slug: initial.profile.slug,
      phone: initial.profile.phone ?? "",
      whatsappNumber: initial.profile.whatsappNumber ?? "",
      bio: initial.profile.bio ?? "",
      languagesSpokenCsv: initial.profile.languagesSpoken.join(", "),
      publicProfileEnabled: initial.profile.publicProfileEnabled,
    },
  });

  function onSubmit(data: Form) {
    setServerError(null);
    setSavedAt(null);
    const languages = data.languagesSpokenCsv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z]{2}$/.test(s));
    const payload: meSchemas.ProfileUpdateInput = {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      slug: data.slug.trim(),
      phone: data.phone.trim() === "" ? null : data.phone.trim(),
      whatsappNumber: data.whatsappNumber.trim() === "" ? null : data.whatsappNumber.trim(),
      bio: data.bio.trim() === "" ? null : data.bio,
      languagesSpoken: languages,
      publicProfileEnabled: data.publicProfileEnabled,
    };
    start(async () => {
      const res = await saveProfileAction(locale, payload);
      if (res.ok) {
        setSavedAt(Date.now());
      } else {
        setServerError(res.error);
      }
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("firstName")} error={formState.errors.firstName?.message}>
          <input className="input" {...register("firstName")} />
        </Field>
        <Field label={t("lastName")} error={formState.errors.lastName?.message}>
          <input className="input" {...register("lastName")} />
        </Field>
      </div>

      <Field label={t("slug")} hint={t("slugHint")} error={formState.errors.slug?.message}>
        <input className="input" {...register("slug")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("phone")}>
          <input className="input" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label={t("whatsapp")}>
          <input className="input" inputMode="tel" {...register("whatsappNumber")} />
        </Field>
      </div>

      <Field label={t("bio")} hint={t("bioHint")}>
        <textarea className="input min-h-[120px]" rows={5} {...register("bio")} />
      </Field>

      <Field label={t("languages")} hint={t("languagesHint")}>
        <input className="input" placeholder="en, es, de" {...register("languagesSpokenCsv")} />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" {...register("publicProfileEnabled")} />
        <span>{t("publicProfileEnabled")}</span>
      </label>

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
