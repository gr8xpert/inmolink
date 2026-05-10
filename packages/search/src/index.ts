/**
 * Search adapter package.
 *
 * Adapter interface lets us swap Meilisearch → OpenSearch / Typesense Cloud
 * later without rewriting callers (PLAN §6, §11.5, ADR 0001).
 *
 * Sprint 3 — Meilisearch implementation + index settings + outbox-driven
 * reindex worker + reindex script (DR rebuild from Postgres).
 */
export type {
  SearchAdapter,
  PropertySearchDocument,
  SearchQuery,
  SearchResult,
} from "./adapter";
export { MeilisearchAdapter } from "./meilisearch-adapter";
export {
  buildPropertyDocuments,
  propertyReindexInclude,
  type ReindexableProperty,
} from "./project";
