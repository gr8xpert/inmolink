"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { saveBillingDetailsAction } from "./actions";

type Props = {
  initial: {
    billingEmail: string | null;
    vatNumber: string | null;
    vatCountryCode: string | null;
  };
  taxIdValidated: boolean;
};

export function BillingDetailsForm({ initial, taxIdValidated }: Props) {
  const t = useTranslations("billing");
  const [state, action, pending] = useActionState(saveBillingDetailsAction, null);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="billingEmail" className="text-xs font-medium uppercase tracking-wide">
          {t("billingEmail")}
        </label>
        <input
          id="billingEmail"
          name="billingEmail"
          type="email"
          defaultValue={initial.billingEmail ?? ""}
          className="input mt-1 w-full"
          placeholder="finance@example.com"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="vatNumber" className="text-xs font-medium uppercase tracking-wide">
            {t("vatNumber")}
          </label>
          <input
            id="vatNumber"
            name="vatNumber"
            type="text"
            defaultValue={initial.vatNumber ?? ""}
            className="input mt-1 w-full"
            placeholder="ESB12345678"
          />
        </div>
        <div>
          <label htmlFor="vatCountryCode" className="text-xs font-medium uppercase tracking-wide">
            {t("vatCountryCode")}
          </label>
          <input
            id="vatCountryCode"
            name="vatCountryCode"
            type="text"
            maxLength={2}
            defaultValue={initial.vatCountryCode ?? ""}
            className="input mt-1 w-full uppercase"
            placeholder="ES"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {taxIdValidated ? `✓ ${t("vatValidated")}` : t("vatPending")}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : t("save")}
        </button>
      </div>

      {state?.ok && <p className="text-xs text-emerald-700">{t("saved")}</p>}
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
