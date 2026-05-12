import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { Star } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Featured listings"
        description="Super-admin curation. Property must be ACTIVE + PUBLIC and the agency on PRO+."
      />

      <div className="space-y-6">
        <SurfaceCard>
          <form className="flex flex-wrap gap-2">
            <select name="surface" defaultValue={surface ?? ""} className="input">
              <option value="">All surfaces</option>
              <option value="PUBLIC_HOME">Public home</option>
              <option value="LOCATION_PAGE">Location page</option>
              <option value="SEARCH_TOP">Search top</option>
              <option value="AGENCY_PROFILE_TOP">Agency profile top</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="activeOnly"
                value="1"
                defaultChecked={activeOnly === "1"}
              />
              Active only
            </label>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>
        </SurfaceCard>

        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard title="Add featured listing">
          <CreateFeaturedForm locale={locale} />
        </SurfaceCard>

        <SurfaceCard title="Current featured" flush>
          {data.items.length === 0 && !listError ? (
            <EmptyState icon={Star} title="No featured listings" />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">
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
                    <Button type="submit" size="sm" variant="danger">
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
