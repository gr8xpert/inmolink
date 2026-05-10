import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { billingSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { openPortalAction, startCheckoutAction } from "./actions";
import { BillingDetailsForm } from "./billing-details-form";
import { PlanBadge } from "./plan-badge";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkout?: string; error?: string }>;
};

export default async function BillingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { checkout, error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("billing");

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let summary: billingSchemas.BillingSummary | null = null;
  let invoices: billingSchemas.SubscriptionInvoice[] = [];
  let summaryError: string | null = null;
  try {
    summary = await apiFetch<billingSchemas.BillingSummary>("/api/dashboard/billing/summary");
    const invRes = await apiFetch<{ items: billingSchemas.SubscriptionInvoice[] }>(
      "/api/dashboard/billing/invoices",
    );
    invoices = invRes.items;
  } catch (err) {
    summaryError = err instanceof ApiError ? err.message : "Failed to load billing summary";
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← {t("backToDashboard")}
        </Link>
      </div>

      {checkout === "success" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {t("checkoutSuccess")}
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">{t("checkoutCancelled")}</div>
      )}
      {error === "PLAN_REQUIRED" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("planRequired")}
        </div>
      )}
      {error === "BILLING_DISABLED" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("billingDisabled")}
        </div>
      )}
      {summaryError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {summaryError}
        </div>
      )}

      {summary && (
        <>
          <section className="rounded-md border bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("currentPlan")}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <PlanBadge tier={summary.planTier} />
                  <span className="text-sm text-muted-foreground">
                    {t(`status.${summary.status}` as never)}
                  </span>
                </div>
                {summary.grantedManually && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("grantedManually")}
                    {summary.grantedUntil && (
                      <>
                        {" "}
                        · {t("grantedUntil")}{" "}
                        {new Date(summary.grantedUntil).toLocaleDateString(locale)}
                      </>
                    )}
                  </p>
                )}
                {summary.currentPeriodEnd && !summary.grantedManually && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {summary.cancelAtPeriodEnd
                      ? t("endsOn", {
                          date: new Date(summary.currentPeriodEnd).toLocaleDateString(locale),
                        })
                      : t("renewsOn", {
                          date: new Date(summary.currentPeriodEnd).toLocaleDateString(locale),
                        })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {summary.planTier === "FREE" && summary.billingEnabled && (
                  <UpgradeButtons locale={locale} />
                )}
                {summary.hasStripeCustomer && summary.billingEnabled && (
                  <form action={openPortalAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <button
                      type="submit"
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {t("manageBilling")}
                    </button>
                  </form>
                )}
                {!summary.billingEnabled && (
                  <span className="text-xs text-muted-foreground">{t("billingNotConfigured")}</span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-md border bg-background p-4 shadow-sm">
            <h2 className="font-semibold">{t("billingDetails")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t("billingDetailsHelp")}</p>
            <BillingDetailsForm
              initial={{
                billingEmail: summary.billingEmail,
                vatNumber: summary.vatNumber,
                vatCountryCode: summary.vatCountryCode,
              }}
              taxIdValidated={summary.taxIdValidated}
            />
          </section>

          <section className="rounded-md border bg-background p-4 shadow-sm">
            <h2 className="font-semibold">{t("invoices")}</h2>
            {invoices.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("noInvoices")}</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">{t("invoiceDate")}</th>
                    <th className="pb-2">{t("invoiceTotal")}</th>
                    <th className="pb-2">{t("invoiceStatus")}</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="py-2">{new Date(inv.createdAt).toLocaleDateString(locale)}</td>
                      <td className="py-2">
                        {(inv.totalCents / 100).toLocaleString(locale, {
                          style: "currency",
                          currency: inv.currency,
                        })}
                      </td>
                      <td className="py-2">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">{inv.status}</span>
                      </td>
                      <td className="py-2 text-right">
                        {inv.hostedInvoiceUrl && (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {t("viewInvoice")}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function UpgradeButtons({ locale }: { locale: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <form action={startCheckoutAction}>
        <input type="hidden" name="cycle" value="MONTHLY" />
        <input type="hidden" name="currency" value="EUR" />
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          PRO · €/mo
        </button>
      </form>
      <form action={startCheckoutAction}>
        <input type="hidden" name="cycle" value="YEARLY" />
        <input type="hidden" name="currency" value="EUR" />
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          PRO · €/yr
        </button>
      </form>
    </div>
  );
}
