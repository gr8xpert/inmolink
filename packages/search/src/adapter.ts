import type { Locale } from "@inmolink/shared";

/**
 * Denormalized document indexed per property in Meilisearch (one entry per locale).
 * Field set finalized in Sprint 3.
 */
export type PropertySearchDocument = {
  id: string;
  ownerUserId: string;
  ownerAgencyId: string;
  locale: Locale;
  title: string;
  description: string;
  slug: string;
  status: string;
  visibility: string;
  transactionType: string;
  priceCents: number;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  propertyTypeId: string;
  propertyTypeName: string;
  locationId: string;
  locationName: string;
  countryCode: string;
  features: string[]; // feature names in this locale
  _geo?: { lat: number; lng: number };
  publishedAt: number | null; // unix seconds for sorting
};

export type SearchQuery = {
  q?: string;
  locale: Locale;
  filters?: {
    transactionType?: string;
    propertyTypeIds?: string[];
    locationIds?: string[];
    minPriceCents?: number;
    maxPriceCents?: number;
    minBedrooms?: number;
    minBathrooms?: number;
    featureIds?: string[];
    countryCode?: string;
  };
  geoRadius?: { lat: number; lng: number; radiusMeters: number };
  sort?: "newest" | "price_asc" | "price_desc";
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  hits: PropertySearchDocument[];
  totalHits: number;
  facets?: Record<string, Record<string, number>>;
  processingTimeMs: number;
};

export interface SearchAdapter {
  /** Upsert a single document into the per-locale index. */
  upsert(doc: PropertySearchDocument): Promise<void>;

  /** Bulk upsert (batch reindex). */
  upsertBatch(docs: PropertySearchDocument[]): Promise<void>;

  /** Remove all locale variants of a property by id. */
  delete(propertyId: string, locales?: Locale[]): Promise<void>;

  /** Run a search query against the locale's index. */
  search(query: SearchQuery): Promise<SearchResult>;

  /** Healthcheck — used by /api/health/ready. */
  ping(): Promise<boolean>;
}
