"use client";

import { type inviteSchemas, inviteSchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { resendInviteAction, revokeInviteAction, sendInviteAction } from "./actions";

type Props = { locale: string; initial: inviteSchemas.TeamResponse };

type InviteForm = { email: string; invitedRole: "AGENT" | "AGENCY_ADMIN" };

export function TeamManager({ locale, initial }: Props) {
  const t = useTranslations("agency.team");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [members] = useState(initial.members);
  const [invites, setInvites] = useState(initial.invites);

  const { register, handleSubmit, reset, formState } = useForm<InviteForm>({
    defaultValues: { email: "", invitedRole: "AGENT" },
  });

  function onInvite(data: InviteForm) {
    setError(null);
    const parsed = schemas.inviteCreateSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    start(async () => {
      const res = await sendInviteAction(locale, parsed.data);
      if (res.ok) {
        // Replace any existing pending invite for this email; api re-issues
        // rather than stacking.
        setInvites((prev) => [
          res.data,
          ...prev.filter((i) => i.email.toLowerCase() !== parsed.data.email.toLowerCase()),
        ]);
        reset();
      } else {
        setError(res.error);
      }
    });
  }

  function onResend(inviteId: string) {
    setError(null);
    start(async () => {
      const res = await resendInviteAction(locale, inviteId);
      if (res.ok) {
        setInvites((prev) => prev.map((i) => (i.id === inviteId ? res.data : i)));
      } else {
        setError(res.error);
      }
    });
  }

  function onRevoke(inviteId: string) {
    setError(null);
    start(async () => {
      const res = await revokeInviteAction(locale, inviteId);
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("invite")}</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr,160px,auto] sm:items-end"
          onSubmit={handleSubmit(onInvite)}
        >
          <Field label={t("email")} error={formState.errors.email?.message}>
            <input
              type="email"
              className="input"
              placeholder="agent@example.com"
              {...register("email", { required: true })}
            />
          </Field>
          <Field label={t("role")}>
            <select className="input" {...register("invitedRole")}>
              <option value="AGENT">{t("rolesLabel.AGENT")}</option>
              <option value="AGENCY_ADMIN">{t("rolesLabel.AGENCY_ADMIN")}</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t("sending") : t("send")}
          </button>
        </form>
        {error && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("members")}</h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <ul className="mt-4 divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  {m.photoPublicUrl ? (
                    <img
                      src={m.photoPublicUrl}
                      alt={`${m.firstName} ${m.lastName}`}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                      {m.firstName[0]}
                      {m.lastName[0]}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t(
                    `rolesLabel.${m.role === "AGENCY_ADMIN" ? "AGENCY_ADMIN" : "AGENT"}` as
                      | "rolesLabel.AGENCY_ADMIN"
                      | "rolesLabel.AGENT",
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("pending")}</h2>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noPending")}</p>
        ) : (
          <ul className="mt-4 divide-y">
            {invites.map((i) => {
              const expired = new Date(i.expiresAt).getTime() < Date.now();
              const days = Math.max(
                0,
                Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
              );
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {expired ? t("expired") : t("expiresIn", { n: days })} ·{" "}
                      {t(
                        `rolesLabel.${i.invitedRole === "AGENCY_ADMIN" ? "AGENCY_ADMIN" : "AGENT"}` as
                          | "rolesLabel.AGENCY_ADMIN"
                          | "rolesLabel.AGENT",
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onResend(i.id)}
                      disabled={pending}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {t("resend")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevoke(i.id)}
                      disabled={pending}
                      className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {t("revoke")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
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
