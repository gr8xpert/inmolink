import { LOCALES, type Locale } from "@inmolink/shared";
import type { PropertySearchDocument } from "./adapter";

/**
 * Pure projection: Prisma Property row (with the includes below) → array of
 * PropertySearchDocuments, one per available translation.
 *
 * The shape is intentionally denormalized: search doesn't join, so every
 * value the result card / facet pane needs has to live on the doc itself.
 * Trade-off vs DB hit per card:
 *
 *  - title / description: per-locale (translation row, falls back to en)
 *  - locationName / propertyTypeName: per-locale (their translation tables)
 *  - features: array of feature names in this locale, used both for
 *    facets and for display chips. Falls back to en name when missing.
 *
 * `_geo` only set when both lat + long are present; else Meili rejects
 * with `_geoRadius` filters returning empty hits, so we drop the field.
 *
 * Callers MUST load the property with the include shape this helper expects
 * — see `propertyReindexInclude` below.
 */

/**
 * Prisma include needed to project a Property row to PropertySearchDocuments.
 * Keep in sync with the input type used by `buildPropertyDocuments`. We don't
 * import Prisma types here (search package has no Prisma dep) — workers spread
 * this object into their own findUnique include.
 */
export const propertyReindexInclude = {
  translations: {
    select: {
      locale: true,
      title: true,
      description: true,
      slug: true,
    },
  },
  propertyType: {
    select: {
      id: true,
      translations: { select: { locale: true, name: true } },
    },
  },
  location: {
    select: {
      id: true,
      countryCode: true,
      translations: { select: { locale: true, name: true } },
    },
  },
  features: {
    select: {
      featureId: true,
      feature: {
        select: {
          translations: { select: { locale: true, name: true } },
        },
      },
    },
  },
} as const;

type Translation = { locale: string; title: string; description: string; slug: string };
type NamedTranslation = { locale: string; name: string };

export type ReindexableProperty = {
  id: string;
  ownerUserId: string;
  ownerAgencyId: string;
  status: string;
  visibility: string;
  transactionType: string;
  priceCents: bigint | number;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  publishedAt: Date | null;
  // Decimals come back as Prisma.Decimal-likes (or numbers in some configs).
  latitude: { toNumber(): number } | number | null;
  longitude: { toNumber(): number } | number | null;
  translations: Translation[];
  propertyType: {
    id: string;
    translations: NamedTranslation[];
  };
  location: {
    id: string;
    countryCode: string;
    translations: NamedTranslation[];
  };
  features: Array<{
    featureId: string;
    feature: { translations: NamedTranslation[] };
  }>;
};

function pickTranslation<T extends { locale: string }>(rows: T[], locale: Locale): T | null {
  return (
    rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en") ?? rows[0] ?? null
  );
}

function decimalOrNull(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  return v.toNumber();
}

/**
 * Returns one document per locale the property has *any* translation for —
 * always including `en` if translations exist at all (we fall back to en in
 * pickTranslation, so a French-only listing still surfaces in /en/search).
 *
 * Returns [] when status !== ACTIVE or visibility !== PUBLIC — the caller
 * should `delete()` instead. Centralising the indexable-iff predicate here
 * keeps the worker / api / reindex script consistent.
 */
export function buildPropertyDocuments(p: ReindexableProperty): PropertySearchDocument[] {
  if (p.status !== "ACTIVE") return [];
  if (p.visibility !== "PUBLIC") return [];

  const lat = decimalOrNull(p.latitude);
  const lng = decimalOrNull(p.longitude);
  const geo = lat !== null && lng !== null ? { lat, lng } : undefined;

  const docs: PropertySearchDocument[] = [];
  for (const locale of LOCALES) {
    const t = pickTranslation(p.translations, locale);
    if (!t) continue;

    const ptName = pickTranslation(p.propertyType.translations, locale);
    const locName = pickTranslation(p.location.translations, locale);
    const featureNames = p.features
      .map((pf) => pickTranslation(pf.feature.translations, locale)?.name ?? null)
      .filter((n): n is string => Boolean(n));

    docs.push({
      id: p.id,
      ownerUserId: p.ownerUserId,
      ownerAgencyId: p.ownerAgencyId,
      locale,
      title: t.title,
      description: t.description,
      slug: t.slug,
      status: p.status,
      visibility: p.visibility,
      transactionType: p.transactionType,
      priceCents: typeof p.priceCents === "bigint" ? Number(p.priceCents) : p.priceCents,
      currency: p.currency,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      areaM2: p.areaM2,
      propertyTypeId: p.propertyType.id,
      propertyTypeName: ptName?.name ?? "",
      locationId: p.location.id,
      locationName: locName?.name ?? "",
      countryCode: p.location.countryCode,
      features: featureNames,
      ...(geo ? { _geo: geo } : {}),
      publishedAt: p.publishedAt ? Math.floor(p.publishedAt.getTime() / 1000) : null,
    });
  }
  return docs;
}
