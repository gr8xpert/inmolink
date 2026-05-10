import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealActions } from "./deal-actions";

type Props = { params: Promise<{ locale: string; id: string }> };

const STATUS_COLORS: Record<string, string> = {
  PENDING_BOTH: "bg-amber-100 text-amber-800",
  PENDING_OWNER: "bg-amber-100 text-amber-800",
  PENDING_INTRODUCER: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  DISPUTED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-zinc-100 text-zinc-700",
};

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
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Deal · {d.id.slice(0, 8)}
          </p>
          <h1 className="text-2xl font-bold">{d.property.title ?? d.property.id}</h1>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-zinc-100"}`}
          >
            {d.status}
          </span>
        </div>
        <Link
          href={`/${locale}/dashboard/deals`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Deals
        </Link>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2 rounded-md border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Parties</h2>
          <p>
            <span className="text-muted-foreground">Listing agent: </span>
            <Link href={`/${locale}/agent/${d.owner.slug}`} className="hover:underline">
              {d.owner.firstName} {d.owner.lastName}
            </Link>
            {d.ownerConfirmedAt && <span className="ml-2 text-emerald-700">✓ confirmed</span>}
          </p>
          <p>
            <span className="text-muted-foreground">Introducer: </span>
            <Link href={`/${locale}/agent/${d.introducer.slug}`} className="hover:underline">
              {d.introducer.firstName} {d.introducer.lastName}
            </Link>
            {d.introducerConfirmedAt && <span className="ml-2 text-emerald-700">✓ confirmed</span>}
          </p>
        </div>

        <div className="space-y-2 rounded-md border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Money</h2>
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
              <div className="flex justify-between border-t pt-1">
                <dt className="text-muted-foreground">Closing date</dt>
                <dd>{d.closingDate}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {d.disputeReason && (
        <section className="space-y-2 rounded-md border border-rose-300 bg-rose-50 p-6 text-sm">
          <h2 className="text-lg font-semibold text-rose-900">Dispute</h2>
          <p className="text-rose-900">{d.disputeReason}</p>
          {d.disputeOpenedAt && (
            <p className="text-xs text-rose-700">
              Opened {new Date(d.disputeOpenedAt).toLocaleString(locale)}
            </p>
          )}
          {d.disputeResolvedAt && (
            <p className="text-xs text-emerald-700">
              Resolved {new Date(d.disputeResolvedAt).toLocaleString(locale)}
            </p>
          )}
        </section>
      )}

      <DealActions locale={locale} deal={d} isSuperAdmin={isSuperAdmin} />
    </main>
  );
}
