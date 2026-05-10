import { publicApiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { publicPropertySchemas, taxonomySchemas } from "@inmolink/shared";
import { AgencyBadge } from "@inmolink/ui";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { SearchFilters } from "./search-filters";

/**
 * Public marketplace search/list page. Postgres-backed in v1; the
 * `/api/public/properties` endpoint swaps to Meilisearch in Sprint 3
 * with the same response shape, so this page won't change.
 *
 * Filters live in the URL searchParams so the page is shareable and
 * back-button-friendly. Each filter form submits via GET; Next.js
 * re-renders the Server Component with the new params.
 *
 * Cursor pagination — never OFFSET. The "Next page" link carries the
 * opaque `cursor` param the api returned with the previous page.
 */

export const revalidate = 60;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: publicPropertySchemas.PublicPropertyListItem[];
  nextCursor: string | null;
};

type TypesResponse = { items: taxonomySchemas.PropertyTypeListItem[] };
type LocationsResponse = { items: taxonomySchemas.LocationListItem[] };
type FeaturesResponse = { items: taxonomySchemas.FeatureListItem[] };

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  // Build the api query string from the URL — only forwarding fields the
  // api schema knows about. Validation lives server-side.
  const apiQs = new URLSearchParams();
  apiQs.set("locale", locale);
  apiQs.set("limit", "20");
  for (const k of [
    "transactionType",
    "propertyTypeId",
    "locationId",
    "minPriceCents",
    "maxPriceCents",
    "bedrooms",
    "q",
    "cursor",
  ] as const) {
    const v = strParam(sp[k]);
    if (v && v.length > 0) apiQs.set(k, v);
  }
  // featureIds is repeated — append, don't set.
  const rawFeatures = sp.featureIds;
  const selectedFeatureIds = Array.isArray(rawFeatures)
    ? rawFeatures.filter((s) => s.length > 0)
    : rawFeatures
      ? [rawFeatures]
      : [];
  for (const id of selectedFeatureIds) apiQs.append("featureIds", id);

  const [list, types, locations, features] = await Promise.all([
    publicApiFetch<ListResponse>(`/api/public/properties?${apiQs.toString()}`, {
      // Filtered queries get short revalidation; the home / no-filter
      // case piggybacks on the page-level export above.
      revalidate: 60,
    }),
    publicApiFetch<TypesResponse>(`/api/dashboard/property-types?locale=${locale}`),
    publicApiFetch<LocationsResponse>(`/api/dashboard/locations?locale=${locale}`),
    publicApiFetch<FeaturesResponse>(`/api/dashboard/features?locale=${locale}`),
  ]);

  // Carry-forward params for the next-page link so filters survive
  // pagination. Strip cursor + replace with the new one. featureIds is
  // multi-valued — re-append every entry.
  const nextHref = list.nextCursor
    ? (() => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (k === "cursor" || v === undefined) continue;
          if (Array.isArray(v)) {
            for (const one of v) if (one) next.append(k, one);
          } else {
            next.set(k, v);
          }
        }
        next.set("cursor", list.nextCursor);
        return `/${locale}/search?${next.toString()}`;
      })()
    : null;

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1 border-b pb-4">
        <h1 className="text-3xl font-bold">Search properties</h1>
        <p className="text-sm text-muted-foreground">
          {list.items.length} on this page
          {list.nextCursor ? " (more available)" : ""}
        </p>
      </header>

      <SearchFilters
        locale={locale}
        propertyTypes={types.items}
        locations={locations.items}
        features={features.items}
        initial={{
          transactionType: strParam(sp.transactionType) ?? "",
          propertyTypeId: strParam(sp.propertyTypeId) ?? "",
          locationId: strParam(sp.locationId) ?? "",
          minPriceCents: strParam(sp.minPriceCents) ?? "",
          maxPriceCents: strParam(sp.maxPriceCents) ?? "",
          bedrooms: strParam(sp.bedrooms) ?? "",
          q: strParam(sp.q) ?? "",
          featureIds: selectedFeatureIds,
        }}
      />

      {list.items.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No properties match these filters.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((p) => (
            <li
              key={p.id}
              className="overflow-hidden rounded-lg border bg-background shadow-sm transition hover:shadow-md"
            >
              <Link href={`/${locale}/property/${p.slug}-${p.id}`} className="block">
                {p.coverUrl ? (
                  <img
                    src={p.coverUrl}
                    alt={p.coverAlt ?? p.title}
                    loading="lazy"
                    className="block aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="space-y-2 p-3">
                  <AgencyBadge name={p.agency.name} logoUrl={p.agency.logoUrl} size="sm" />
                  <h2 className="line-clamp-2 text-base font-semibold">{p.title}</h2>
                  <p className="text-lg font-semibold">
                    {formatMoney(p.priceCents, p.currency, locale)}
                    {p.priceType === "from" && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">from</span>
                    )}
                    {p.priceType === "poa" && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">POA</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{p.transactionType.replace("_", " ")}</span>
                    {p.bedrooms !== null && <span>· {p.bedrooms} bed</span>}
                    {p.bathrooms !== null && <span>· {p.bathrooms} bath</span>}
                    {p.areaM2 !== null && <span>· {p.areaM2} m²</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextHref && (
        <div className="flex justify-end">
          <Link
            href={nextHref}
            className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next page →
          </Link>
        </div>
      )}
    </main>
  );
}
