import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { dealSchemas } from "@inmolink/shared";
import { ShieldAlert } from "lucide-react";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Disputes queue"
        description="Deals flagged for super-admin review. Resolve each by accepting or cancelling the snapshot."
      />

      <div className="space-y-6">
        <SurfaceCard flush>
          {list.items.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No open disputes" />
          ) : (
            <ul className="divide-y divide-border">
              {list.items.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/${locale}/dashboard/deals/${d.id}`}
                    className="block px-5 py-4 transition hover:bg-muted/40"
                  >
                    <p className="font-medium text-foreground">
                      {d.property.title ?? d.property.id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {d.owner.firstName} {d.owner.lastName} ↔ {d.introducer.firstName}{" "}
                      {d.introducer.lastName} ·{" "}
                      <span className="font-mono">
                        {formatMoney(d.agreedPriceCents, d.currency, locale)}
                      </span>
                    </p>
                    {d.disputeReason && (
                      <p className="mt-2 line-clamp-2 text-sm text-danger">{d.disputeReason}</p>
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
        </SurfaceCard>

        {list.nextCursor && (
          <div className="flex justify-end">
            <LinkButton
              variant="secondary"
              href={`/${locale}/dashboard/admin/disputes?cursor=${list.nextCursor}`}
            >
              Next page →
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
