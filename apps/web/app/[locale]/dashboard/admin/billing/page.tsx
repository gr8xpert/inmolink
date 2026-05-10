import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { billingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Billing &amp; manual grants</h1>
          <p className="text-sm text-muted-foreground">
            All agencies + their subscription state. Grant a plan tier with optional expiry, or
            revoke back to FREE. Every action is audit-logged.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter by name or slug…"
          className="input flex-1"
        />
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Search
        </button>
      </form>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="space-y-3">
        {data.items.map((row) => (
          <div
            key={row.agencyId}
            className="flex flex-col gap-3 rounded-md border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{row.agencyName}</p>
              <p className="text-xs text-muted-foreground">
                {row.agencySlug} · {row.billingEmail ?? "—"}
              </p>
              <p className="mt-1 text-xs">
                <span className="rounded bg-muted px-2 py-0.5 font-semibold uppercase">
                  {row.planTier}
                </span>{" "}
                <span className="text-muted-foreground">{row.status}</span>
                {row.grantedManually && (
                  <span className="ml-2 rounded border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">
                    manual grant
                    {row.grantedUntil &&
                      ` · until ${new Date(row.grantedUntil).toLocaleDateString(locale)}`}
                  </span>
                )}
              </p>
              {row.grantedReason && (
                <p className="mt-1 text-xs italic text-muted-foreground">"{row.grantedReason}"</p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <details>
                <summary className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                  Grant…
                </summary>
                <div className="mt-2 w-72 rounded-md border bg-background p-3 shadow-sm">
                  <GrantForm agencyId={row.agencyId} locale={locale} />
                </div>
              </details>
              {row.grantedManually && <RevokeButton agencyId={row.agencyId} locale={locale} />}
            </div>
          </div>
        ))}

        {data.items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No agencies match.</p>
        )}
      </section>

      {data.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/admin/billing`,
              query: { ...(q ? { q } : {}), cursor: data.nextCursor },
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next page →
          </Link>
        </div>
      )}
    </main>
  );
}
