"use client";

import { type inviteSchemas, inviteSchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { acceptInviteNewAction, signInAfterAcceptAction } from "./actions";

type Props = { locale: string; token: string; invite: inviteSchemas.InviteForAccept };

type Form = {
  firstName: string;
  lastName: string;
  password: string;
};

export function AcceptForm({ locale, token, invite }: Props) {
  const t = useTranslations("invite");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<Form>({
    defaultValues: { firstName: "", lastName: "", password: "" },
  });

  function onSubmit(data: Form) {
    setError(null);
    const parsed = schemas.inviteAcceptNewSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await acceptInviteNewAction(token, parsed.data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Sign the new user in immediately — credentials are still in memory.
      await signInAfterAcceptAction(invite.email, data.password, `/${locale}/dashboard`);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label={t("email")}>
        <input className="input" type="email" value={invite.email} disabled readOnly />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("firstName")} error={formState.errors.firstName?.message}>
          <input className="input" {...register("firstName", { required: true })} />
        </Field>
        <Field label={t("lastName")} error={formState.errors.lastName?.message}>
          <input className="input" {...register("lastName", { required: true })} />
        </Field>
      </div>
      <Field label={t("password")} error={formState.errors.password?.message}>
        <input
          type="password"
          autoComplete="new-password"
          className="input"
          {...register("password", { required: true, minLength: 12 })}
        />
      </Field>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("accepting") : t("accept")}
      </button>
    </form>
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
    // biome-ignore lint/a11y/noLabelWithoutControl: input passed via children — implicit HTML5 association still works.
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}
