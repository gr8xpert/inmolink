import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealActions } from "./deal-actions";

type Props = { params: Promise<{ locale: string; id: string }> };

function formatMoney(cents: string, currency: string, locale: string): string {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export default async function DealDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const d = await apiFetch<dealSchemas.Deal>(`/api/dashboard/deals/${encodeURIComponent(id)}`);

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={d.property.title ?? d.property.id}
        description={`Deal · ${d.id.slice(0, 8)}`}
        actions={<StatusBadge label={d.status} tone={toneForStatus(d.status)} />}
      />

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <SurfaceCard title="Parties">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Listing agent: </span>
                <Link href={`/${locale}/agent/${d.owner.slug}`} className="hover:underline">
                  {d.owner.firstName} {d.owner.lastName}
                </Link>
                {d.ownerConfirmedAt && <span className="ml-2 text-success">✓ confirmed</span>}
              </p>
              <p>
                <span className="text-muted-foreground">Introducer: </span>
                <Link href={`/${locale}/agent/${d.introducer.slug}`} className="hover:underline">
                  {d.introducer.firstName} {d.introducer.lastName}
                </Link>
                {d.introducerConfirmedAt && <span className="ml-2 text-success">✓ confirmed</span>}
              </p>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Money">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agreed price</dt>
                <dd className="font-mono font-semibold">
                  {formatMoney(d.agreedPriceCents, d.currency, locale)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Commission</dt>
                <dd className="font-mono">
                  {Number(d.commissionPct).toFixed(2)}% ·{" "}
                  {formatMoney(d.totalCommissionCents, d.currency, locale)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Listing agent</dt>
                <dd className="font-mono">{formatMoney(d.ownerAmountCents, d.currency, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Introducer ({Number(d.introducerSharePct).toFixed(2)}%)
                </dt>
                <dd className="font-mono">
                  {formatMoney(d.introducerAmountCents, d.currency, locale)}
                </dd>
              </div>
              {d.closingDate && (
                <div className="flex justify-between border-t border-border pt-1">
                  <dt className="text-muted-foreground">Closing date</dt>
                  <dd>{d.closingDate}</dd>
                </div>
              )}
            </dl>
          </SurfaceCard>
        </div>

        {d.disputeReason && (
          <section className="rounded-md border border-danger/30 bg-danger-soft p-5 text-sm">
            <h2 className="text-base font-semibold text-danger">Dispute</h2>
            <p className="mt-2 text-danger">{d.disputeReason}</p>
            {d.disputeOpenedAt && (
              <p className="mt-1 text-xs text-danger/80">
                Opened {new Date(d.disputeOpenedAt).toLocaleString(locale)}
              </p>
            )}
            {d.disputeResolvedAt && (
              <p className="mt-1 text-xs text-success">
                Resolved {new Date(d.disputeResolvedAt).toLocaleString(locale)}
              </p>
            )}
          </section>
        )}

        <DealActions locale={locale} deal={d} isSuperAdmin={isSuperAdmin} />
      </div>
    </div>
  );
}
