import type { Locale } from "@inmolink/shared";

export type FeedConnectorKind = "KYERO" | "RESALE_ONLINE" | "GENERIC_XML";

/**
 * Per-feature names keyed by source locale. Connector emits whatever locales
 * the feed carries; matcher in the worker prefers `en` then falls back to
 * the first available locale when looking up the Feature taxonomy.
 */
export type FeatureName = {
  /** Canonical key — `en` if present, else the first available locale's value. */
  canonical: string;
  perLocale: Partial<Record<Locale, string>>;
};

/** Normalized listing emitted by every connector (one shape, regardless of source). */
export type NormalizedListing = {
  externalRef: string;
  source: FeedConnectorKind;

  // Transaction
  transactionType: "SALE" | "RENT" | "SHORT_TERM";
  priceCents: bigint;
  currency: string; // ISO-4217

  // Location (plain text — fuzzy-matched to Location table during upsert)
  townName: string;
  provinceName?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  addressLine?: string;
  postcode?: string;

  // Classification (plain text — mapped to PropertyType / Feature taxonomy)
  typeName: string;
  features: FeatureName[];

  // Specs
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  plotM2?: number;
  yearBuilt?: number;

  // Per-locale content (only locales present in feed)
  translations: Partial<Record<Locale, { title?: string; description?: string }>>;

  // Media — connector returns external URLs; worker downloads → R2 → variants.
  // Hash content (post-download) for dedup, NOT URL (cache busters).
  imageUrls: string[];
  floorPlanUrls?: string[];
  videoUrl?: string;
  virtualTourUrl?: string;

  // Source timestamp (used for diff detection)
  sourceUpdatedAt?: Date;
};

/**
 * Connector contract — every adapter implements this. The connector returns
 * an async iterable so the worker can process listings as they parse without
 * buffering the whole feed (PLAN §11.5 + samples/feeds/README.md note 1).
 */
export interface FeedConnector {
  readonly kind: FeedConnectorKind;
  fetch(input: FeedFetchInput): AsyncIterable<NormalizedListing>;
}

export type FeedFetchInput = {
  feedUrl: string;
  /** Decrypted credentials (decrypt happens in worker, not in adapter). */
  credentials?: Record<string, string>;
  /** GENERIC_XML: agent-defined source-field → our-field map. */
  fieldMappings?: Record<string, string>;
  /** Defaults for missing fields. */
  defaults?: Partial<NormalizedListing>;
  /** Bearer of the abort signal — adapter must respect for cancellation. */
  signal?: AbortSignal;
};
