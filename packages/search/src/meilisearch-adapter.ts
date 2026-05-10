import { LOCALES, type Locale } from "@inmolink/shared";
import { MeiliSearch } from "meilisearch";
import type { PropertySearchDocument, SearchAdapter, SearchQuery, SearchResult } from "./adapter";

const INDEX_PREFIX = "properties_";

/**
 * Index settings applied at bootstrap. Search-by-text targets the
 * translatable fields; filters/sorts only target the typed columns. The
 * Meilisearch ranking rules order is the recommended default — relevance
 * (words / typo / proximity / attribute) before custom (publishedAt:desc),
 * so a slightly older but vastly more relevant property still wins. See
 * §11.5 of PLAN: "Meilisearch outbox pattern + per-locale indices".
 */
const SEARCHABLE_ATTRIBUTES = ["title", "description", "locationName", "propertyTypeName"];
const FILTERABLE_ATTRIBUTES = [
  "transactionType",
  "propertyTypeId",
  "locationId",
  "countryCode",
  "priceCents",
  "bedrooms",
  "bathrooms",
  "features",
  "status",
  "visibility",
  "_geo",
];
const SORTABLE_ATTRIBUTES = ["publishedAt", "priceCents", "_geo"];

export class MeilisearchAdapter implements SearchAdapter {
  private readonly client: MeiliSearch;

  constructor(host: string, apiKey: string) {
    this.client = new MeiliSearch({ host, apiKey });
  }

  private indexName(locale: Locale): string {
    return `${INDEX_PREFIX}${locale}`;
  }

  /**
   * Bootstrap one locale's index — idempotent. Safe to call on every
   * worker boot; Meili applies the setting tasks in a queue and skips
   * no-ops. Run once at deploy time and again on the reindex script.
   */
  async configureIndex(locale: Locale): Promise<void> {
    const index = this.client.index(this.indexName(locale));
    await index.updateSettings({
      searchableAttributes: SEARCHABLE_ATTRIBUTES,
      filterableAttributes: FILTERABLE_ATTRIBUTES,
      sortableAttributes: SORTABLE_ATTRIBUTES,
      // Default ranking rules + custom relevance booster for fresh listings.
      rankingRules: [
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
        "publishedAt:desc",
      ],
      // Pagination cap protects against scrapers paging through all 30K+
      // listings; cursor users on the dashboard hit this never.
      pagination: { maxTotalHits: 5000 },
    });
  }

  /** Bootstrap all locale indices in parallel — used by reindex script. */
  async configureAllIndices(): Promise<void> {
    await Promise.all([...LOCALES].map((locale) => this.configureIndex(locale)));
  }

  async upsert(doc: PropertySearchDocument): Promise<void> {
    const index = this.client.index(this.indexName(doc.locale));
    await index.addDocuments([doc], { primaryKey: "id" });
  }

  async upsertBatch(docs: PropertySearchDocument[]): Promise<void> {
    if (docs.length === 0) return;

    // Group by locale → one task per index
    const byLocale = new Map<Locale, PropertySearchDocument[]>();
    for (const d of docs) {
      const existing = byLocale.get(d.locale);
      if (existing) {
        existing.push(d);
      } else {
        byLocale.set(d.locale, [d]);
      }
    }

    await Promise.all(
      Array.from(byLocale.entries()).map(([locale, batch]) =>
        this.client.index(this.indexName(locale)).addDocuments(batch, { primaryKey: "id" }),
      ),
    );
  }

  async delete(propertyId: string, locales: Locale[] = [...LOCALES]): Promise<void> {
    await Promise.all(
      locales.map((locale) => this.client.index(this.indexName(locale)).deleteDocument(propertyId)),
    );
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const index = this.client.index(this.indexName(query.locale));

    const filters: string[] = [];
    if (query.filters?.transactionType)
      filters.push(`transactionType = "${query.filters.transactionType}"`);
    if (query.filters?.countryCode) filters.push(`countryCode = "${query.filters.countryCode}"`);
    if (query.filters?.propertyTypeIds?.length) {
      filters.push(
        `propertyTypeId IN [${query.filters.propertyTypeIds.map((id) => `"${id}"`).join(",")}]`,
      );
    }
    if (query.filters?.locationIds?.length) {
      filters.push(`locationId IN [${query.filters.locationIds.map((id) => `"${id}"`).join(",")}]`);
    }
    if (typeof query.filters?.minPriceCents === "number") {
      filters.push(`priceCents >= ${query.filters.minPriceCents}`);
    }
    if (typeof query.filters?.maxPriceCents === "number") {
      filters.push(`priceCents <= ${query.filters.maxPriceCents}`);
    }
    if (typeof query.filters?.minBedrooms === "number") {
      filters.push(`bedrooms >= ${query.filters.minBedrooms}`);
    }
    if (typeof query.filters?.minBathrooms === "number") {
      filters.push(`bathrooms >= ${query.filters.minBathrooms}`);
    }
    if (query.geoRadius) {
      filters.push(
        `_geoRadius(${query.geoRadius.lat}, ${query.geoRadius.lng}, ${query.geoRadius.radiusMeters})`,
      );
    }

    const sortMap: Record<NonNullable<SearchQuery["sort"]>, string[]> = {
      newest: ["publishedAt:desc"],
      price_asc: ["priceCents:asc"],
      price_desc: ["priceCents:desc"],
    };

    const result = await index.search<PropertySearchDocument>(query.q ?? "", {
      filter: filters,
      sort: query.sort ? sortMap[query.sort] : undefined,
      limit: query.limit ?? 24,
      offset: query.offset ?? 0,
      facets: ["transactionType", "propertyTypeId", "locationId", "bedrooms", "features"],
    });

    return {
      hits: result.hits,
      totalHits: result.estimatedTotalHits ?? result.hits.length,
      facets: result.facetDistribution as Record<string, Record<string, number>> | undefined,
      processingTimeMs: result.processingTimeMs,
    };
  }

  async ping(): Promise<boolean> {
    try {
      const health = await this.client.health();
      return health.status === "available";
    } catch {
      return false;
    }
  }
}
