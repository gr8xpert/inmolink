import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; cursor?: string }>;
};

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

export default async function DealsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "deals" });

  const qs = new URLSearchParams();
  if (search.status) qs.set("status", search.status);
  if (search.cursor) qs.set("cursor", search.cursor);
  const list = await apiFetch<dealSchemas.DealListResponse>(
    `/api/dashboard/deals?${qs.toString()}`,
  );

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← {t("back")}
        </Link>
      </header>

      {list.items.length === 0 ? (
        <p className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background shadow-sm">
          {list.items.map((d) => {
            const counterparty =
              session.user?.id === d.owner.id
                ? `${d.introducer.firstName} ${d.introducer.lastName}`
                : `${d.owner.firstName} ${d.owner.lastName}`;
            return (
              <li key={d.id}>
                <Link
                  href={`/${locale}/dashboard/deals/${d.id}`}
                  className="block p-4 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{d.property.title ?? d.property.id}</p>
                      <p className="text-sm text-muted-foreground">
                        with {counterparty} ·{" "}
                        <span className="font-mono">
                          {formatMoney(d.agreedPriceCents, d.currency, locale)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("fields.totalCommission")}:{" "}
                        <span className="font-mono">
                          {formatMoney(d.totalCommissionCents, d.currency, locale)}
                        </span>{" "}
                        · {Number(d.commissionPct).toFixed(2)}%
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-zinc-100"}`}
                    >
                      {t(`status.${d.status}`)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {list.nextCursor && (
        <Link
          href={`/${locale}/dashboard/deals?${new URLSearchParams({ ...search, cursor: list.nextCursor }).toString()}`}
          className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("next")}
        </Link>
      )}
    </main>
  );
}
