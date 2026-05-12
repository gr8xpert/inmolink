import { Button } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { billingSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="space-y-6">
        {checkout === "success" && (
          <div className="rounded-md border border-success/30 bg-success-soft p-3 text-sm text-success">
            {t("checkoutSuccess")}
          </div>
        )}
        {checkout === "cancelled" && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            {t("checkoutCancelled")}
          </div>
        )}
        {error === "PLAN_REQUIRED" && (
          <div className="rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            {t("planRequired")}
          </div>
        )}
        {error === "BILLING_DISABLED" && (
          <div className="rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            {t("billingDisabled")}
          </div>
        )}
        {summaryError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {summaryError}
          </div>
        )}

        {summary && (
          <>
            <SurfaceCard>
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
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
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {summary.planTier === "FREE" && summary.billingEnabled && (
                    <UpgradeButtons locale={locale} />
                  )}
                  {summary.hasStripeCustomer && summary.billingEnabled && (
                    <form action={openPortalAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <Button type="submit" variant="secondary">
                        {t("manageBilling")}
                      </Button>
                    </form>
                  )}
                  {!summary.billingEnabled && (
                    <span className="text-xs text-muted-foreground">
                      {t("billingNotConfigured")}
                    </span>
                  )}
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard title={t("billingDetails")} description={t("billingDetailsHelp")}>
              <BillingDetailsForm
                initial={{
                  billingEmail: summary.billingEmail,
                  vatNumber: summary.vatNumber,
                  vatCountryCode: summary.vatCountryCode,
                }}
                taxIdValidated={summary.taxIdValidated}
              />
            </SurfaceCard>

            <SurfaceCard title={t("invoices")} flush={invoices.length > 0}>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3">{t("invoiceDate")}</th>
                      <th className="px-5 py-3">{t("invoiceTotal")}</th>
                      <th className="px-5 py-3">{t("invoiceStatus")}</th>
                      <th className="px-5 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3">
                          {new Date(inv.createdAt).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3 font-medium text-foreground">
                          {(inv.totalCents / 100).toLocaleString(locale, {
                            style: "currency",
                            currency: inv.currency,
                          })}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge label={inv.status} tone={toneForStatus(inv.status)} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          {inv.hostedInvoiceUrl && (
                            <a
                              href={inv.hostedInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {t("viewInvoice")} →
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SurfaceCard>
          </>
        )}
      </div>
    </div>
  );
}

function UpgradeButtons({ locale }: { locale: string }) {
  return (
    <div className="flex gap-2">
      <form action={startCheckoutAction}>
        <input type="hidden" name="cycle" value="MONTHLY" />
        <input type="hidden" name="currency" value="EUR" />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit">PRO · €/mo</Button>
      </form>
      <form action={startCheckoutAction}>
        <input type="hidden" name="cycle" value="YEARLY" />
        <input type="hidden" name="currency" value="EUR" />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit">PRO · €/yr</Button>
      </form>
    </div>
  );
}
