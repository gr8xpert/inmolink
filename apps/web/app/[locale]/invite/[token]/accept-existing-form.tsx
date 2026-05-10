"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInviteExistingAction } from "./actions";

type Props = { locale: string; token: string; agencyName: string };

export function AcceptExistingForm({ locale, token, agencyName }: Props) {
  const t = useTranslations("invite");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAccept() {
    setError(null);
    start(async () => {
      const res = await acceptInviteExistingAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onAccept}
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("accepting") : t("acceptAsExisting", { agencyName })}
      </button>
    </div>
  );
}
