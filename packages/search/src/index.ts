/**
 * Search adapter package.
 *
 * Adapter interface lets us swap Meilisearch → OpenSearch / Typesense Cloud
 * later without rewriting callers (PLAN §6, §11.5, ADR 0001).
 *
 * Sprint 0 — interface + Meilisearch implementation stub.
 * Real indexing + outbox pattern wiring in Sprint 3.
 */
export type {
  SearchAdapter,
  PropertySearchDocument,
  SearchQuery,
  SearchResult,
} from "./adapter";
export { MeilisearchAdapter } from "./meilisearch-adapter";
