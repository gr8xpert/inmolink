import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteFeaturedAction } from "./actions";
import { CreateFeaturedForm } from "./create-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ surface?: string; activeOnly?: string }>;
};

export default async function FeaturedListingsAdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { surface, activeOnly } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  qs.set("limit", "50");
  if (surface) qs.set("surface", surface);
  if (activeOnly === "1") qs.set("activeOnly", "true");

  let data: { items: marketingSchemas.FeaturedListing[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/admin/featured-listings?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Featured listings</h1>
          <p className="text-sm text-muted-foreground">
            Super-admin curation. Property must be ACTIVE + PUBLIC and the agency on PRO+.
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
        <select name="surface" defaultValue={surface ?? ""} className="input">
          <option value="">All surfaces</option>
          <option value="PUBLIC_HOME">Public home</option>
          <option value="LOCATION_PAGE">Location page</option>
          <option value="SEARCH_TOP">Search top</option>
          <option value="AGENCY_PROFILE_TOP">Agency profile top</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activeOnly" value="1" defaultChecked={activeOnly === "1"} />
          Active only
        </label>
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Filter
        </button>
      </form>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">Add featured listing</h2>
        <CreateFeaturedForm locale={locale} />
      </section>

      <section className="space-y-2">
        {data.items.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between rounded-md border bg-background p-3 shadow-sm"
          >
            <div>
              <p className="font-medium">
                {f.propertyTitle ?? "(no translation)"} · {f.agencyName}
              </p>
              <p className="text-xs text-muted-foreground">
                {f.surface} · pos {f.position} · {f.source} ·{" "}
                {new Date(f.startsAt).toLocaleDateString(locale)} →{" "}
                {new Date(f.endsAt).toLocaleDateString(locale)}
              </p>
            </div>
            <form action={deleteFeaturedAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100"
              >
                Delete
              </button>
            </form>
          </div>
        ))}
        {data.items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No featured listings.</p>
        )}
      </section>
    </main>
  );
}
