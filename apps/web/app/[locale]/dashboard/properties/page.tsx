import { LinkButton } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { auth } from "@inmolink/auth";
import type { propertySchemas, taxonomySchemas } from "@inmolink/shared";
import { Home } from "lucide-react";
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

export default async function PropertiesListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "properties" });
  const sp = await searchParams;

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
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <LinkButton href={`/${locale}/dashboard/properties/new`}>+ {t("createNew")}</LinkButton>
        }
      />

      <div className="mb-6">
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
      </div>

      <SurfaceCard flush>
        {data.items.length === 0 ? (
          <EmptyState
            icon={Home}
            title={t("empty")}
            cta={{ label: `+ ${t("createNew")}`, href: `/${locale}/dashboard/properties/new` }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/dashboard/properties/${p.id}`}
                  className="block px-5 py-4 transition hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{p.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(`transaction.${p.transactionType}`)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-foreground">
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
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {p.bedrooms !== null && <span>{t("bedrooms", { n: p.bedrooms })}</span>}
                        {p.bathrooms !== null && (
                          <span>· {t("bathrooms", { n: p.bathrooms })}</span>
                        )}
                        {p.areaM2 !== null && <span>· {p.areaM2} m²</span>}
                        <span>
                          · {t("created")} {formatDate(p.createdAt, locale)}
                        </span>
                      </div>
                    </div>
                    <StatusBadge label={t(`status.${p.status}`)} tone={toneForStatus(p.status)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      {nextHref && (
        <div className="mt-4 flex justify-end">
          <LinkButton href={nextHref} variant="secondary">
            {t("nextPage")} →
          </LinkButton>
        </div>
      )}
    </div>
  );
}
