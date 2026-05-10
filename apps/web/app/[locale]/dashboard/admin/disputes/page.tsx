import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

function formatMoney(cents: string, currency: string, locale: string): string {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export default async function DisputesQueuePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  if (sp.cursor) qs.set("cursor", sp.cursor);
  const list = await apiFetch<dealSchemas.DealListResponse>(
    `/api/dashboard/deals/disputes?${qs.toString()}`,
  );

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Disputes queue</h1>
          <p className="text-sm text-muted-foreground">
            Deals flagged for super-admin review. Resolve each by accepting or cancelling the
            snapshot.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      {list.items.length === 0 ? (
        <p className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          No open disputes.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background shadow-sm">
          {list.items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/${locale}/dashboard/deals/${d.id}`}
                className="block p-4 hover:bg-muted/40"
              >
                <p className="font-medium">{d.property.title ?? d.property.id}</p>
                <p className="text-sm text-muted-foreground">
                  {d.owner.firstName} {d.owner.lastName} ↔ {d.introducer.firstName}{" "}
                  {d.introducer.lastName} ·{" "}
                  <span className="font-mono">
                    {formatMoney(d.agreedPriceCents, d.currency, locale)}
                  </span>
                </p>
                {d.disputeReason && (
                  <p className="mt-2 line-clamp-2 text-sm text-rose-700">{d.disputeReason}</p>
                )}
                {d.disputeOpenedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opened {new Date(d.disputeOpenedAt).toLocaleString(locale)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.nextCursor && (
        <Link
          href={`/${locale}/dashboard/admin/disputes?cursor=${list.nextCursor}`}
          className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Next page
        </Link>
      )}
    </main>
  );
}
