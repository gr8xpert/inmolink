"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { changePasswordAction } from "./actions";

const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(12, "At least 12 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from current",
    path: ["newPassword"],
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Form = z.infer<typeof formSchema>;

export function PasswordForm() {
  const t = useTranslations("settings.password");
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function onSubmit(data: Form) {
    setServerError(null);
    setSavedAt(null);
    start(async () => {
      const res = await changePasswordAction({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (res.ok) {
        setSavedAt(Date.now());
        reset();
      } else {
        setServerError(res.status === 401 ? t("incorrectCurrent") : res.error);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label={t("currentPassword")} error={formState.errors.currentPassword?.message}>
        <input
          type="password"
          autoComplete="current-password"
          className="input"
          {...register("currentPassword")}
        />
      </Field>
      <Field
        label={t("newPassword")}
        hint={t("newPasswordHint")}
        error={formState.errors.newPassword?.message}
      >
        <input
          type="password"
          autoComplete="new-password"
          className="input"
          {...register("newPassword")}
        />
      </Field>
      <Field label={t("confirmPassword")} error={formState.errors.confirmPassword?.message}>
        <input
          type="password"
          autoComplete="new-password"
          className="input"
          {...register("confirmPassword")}
        />
      </Field>

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
