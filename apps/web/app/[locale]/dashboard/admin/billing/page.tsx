import { Button, LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { billingSchemas } from "@inmolink/shared";
import { CreditCard } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { GrantForm } from "./grant-form";
import { RevokeButton } from "./revoke-button";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; cursor?: string }>;
};

export default async function AdminBillingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q, cursor } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (cursor) qs.set("cursor", cursor);
  qs.set("limit", "25");

  let data: { items: billingSchemas.AdminBillingAgencyRow[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/admin/billing/agencies?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load agencies";
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Billing & manual grants"
        description="All agencies + their subscription state. Grant a plan tier with optional expiry, or revoke back to FREE. Every action is audit-logged."
      />

      <div className="space-y-6">
        <SurfaceCard>
          <form className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Filter by name or slug…"
              className="input flex-1"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </SurfaceCard>

        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard flush>
          {data.items.length === 0 && !listError ? (
            <EmptyState icon={CreditCard} title="No agencies match" />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((row) => (
                <li
                  key={row.agencyId}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{row.agencyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.agencySlug} · {row.billingEmail ?? "—"}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-0.5 font-semibold uppercase">
                        {row.planTier}
                      </span>
                      <span className="text-muted-foreground">{row.status}</span>
                      {row.grantedManually && (
                        <span className="rounded border border-warning/30 bg-warning-soft px-2 py-0.5 text-warning">
                          manual grant
                          {row.grantedUntil &&
                            ` · until ${new Date(row.grantedUntil).toLocaleDateString(locale)}`}
                        </span>
                      )}
                    </p>
                    {row.grantedReason && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{row.grantedReason}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <details>
                      <summary className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">
                        Grant…
                      </summary>
                      <div className="surface mt-2 w-72 p-3">
                        <GrantForm agencyId={row.agencyId} locale={locale} />
                      </div>
                    </details>
                    {row.grantedManually && (
                      <RevokeButton agencyId={row.agencyId} locale={locale} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        {data.nextCursor && (
          <div className="flex justify-end">
            <LinkButton
              variant="secondary"
              href={{
                pathname: `/${locale}/dashboard/admin/billing`,
                query: { ...(q ? { q } : {}), cursor: data.nextCursor },
              }}
            >
              Next page →
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
