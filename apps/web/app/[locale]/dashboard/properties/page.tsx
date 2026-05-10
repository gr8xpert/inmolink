import { ApiError, apiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { auth } from "@inmolink/auth";
import type { propertySchemas, taxonomySchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PropertyFilters } from "./property-filters";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListResponse = {
  items: Array<propertySchemas.PropertyListItem>;
  nextCursor: string | null;
};

type TypesResponse = { items: taxonomySchemas.PropertyTypeListItem[] };
type LocationsResponse = { items: taxonomySchemas.LocationListItem[] };

const FILTER_KEYS = [
  "q",
  "status",
  "visibility",
  "transactionType",
  "propertyTypeId",
  "locationId",
] as const;

function strParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  UNDER_OFFER: "bg-amber-100 text-amber-800",
  SOLD: "bg-blue-100 text-blue-800",
  RENTED: "bg-blue-100 text-blue-800",
  WITHDRAWN: "bg-rose-100 text-rose-800",
};

export default async function PropertiesListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "properties" });
  const sp = await searchParams;

  // Build the api query from URL searchParams, forwarding only fields the
  // api list schema understands. Cursor is included when present.
  const qs = new URLSearchParams();
  qs.set("limit", "20");
  const cursor = strParam(sp.cursor);
  if (cursor) qs.set("cursor", cursor);
  for (const k of FILTER_KEYS) {
    const v = strParam(sp[k]);
    if (v && v.length > 0) qs.set(k, v);
  }

  let data: ListResponse;
  let types: TypesResponse;
  let locations: LocationsResponse;
  try {
    [data, types, locations] = await Promise.all([
      apiFetch<ListResponse>(`/api/dashboard/properties?${qs.toString()}`),
      apiFetch<TypesResponse>(`/api/dashboard/property-types?locale=${locale}`),
      apiFetch<LocationsResponse>(`/api/dashboard/locations?locale=${locale}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  // Carry-forward filters into the next-page link so pagination doesn't
  // reset the user's filters.
  const nextHref = data.nextCursor
    ? (() => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (k === "cursor" || v === undefined) continue;
          next.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
        }
        next.set("cursor", data.nextCursor);
        return `/${locale}/dashboard/properties?${next.toString()}`;
      })()
    : null;

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/dashboard/properties/new`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            {t("createNew")}
          </Link>
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </header>

      <PropertyFilters
        locale={locale}
        propertyTypes={types.items}
        locations={locations.items}
        initial={{
          q: strParam(sp.q) ?? "",
          status: strParam(sp.status) ?? "",
          visibility: strParam(sp.visibility) ?? "",
          transactionType: strParam(sp.transactionType) ?? "",
          propertyTypeId: strParam(sp.propertyTypeId) ?? "",
          locationId: strParam(sp.locationId) ?? "",
        }}
      />

      {data.items.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-3">
          {data.items.map((p) => (
            <li
              key={p.id}
              className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
            >
              <Link href={`/${locale}/dashboard/properties/${p.id}`} className="block space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-muted-foreground">#{p.id.slice(0, 8)}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[p.status] ?? "bg-zinc-100 text-zinc-800"}`}
                  >
                    {t(`status.${p.status}`)}
                  </span>
                </div>
                <p className="text-xl font-semibold">
                  {formatMoney(p.priceCents, p.currency, locale)}
                  {p.priceType === "from" && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {t("priceFrom")}
                    </span>
                  )}
                  {p.priceType === "poa" && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {t("pricePoa")}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{t(`transaction.${p.transactionType}`)}</span>
                  {p.bedrooms !== null && <span>· {t("bedrooms", { n: p.bedrooms })}</span>}
                  {p.bathrooms !== null && <span>· {t("bathrooms", { n: p.bathrooms })}</span>}
                  {p.areaM2 !== null && <span>· {p.areaM2} m²</span>}
                  <span className="ml-auto text-xs">
                    {t("created")} {formatDate(p.createdAt, locale)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextHref && (
        <div className="flex justify-end">
          <Link href={nextHref} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            {t("nextPage")}
          </Link>
        </div>
      )}
    </main>
  );
}
