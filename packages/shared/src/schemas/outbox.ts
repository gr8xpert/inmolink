import { z } from "zod";
import { localeSchema } from "../locales";

/**
 * Outbox topics + payload shapes used by the `search-reindex` worker
 * (PLAN §11.5 outbox pattern). The same row in `OutboxEvent` is consumed
 * by exactly one worker today; if a future consumer joins (cache purge,
 * webhooks, …) it should subscribe to its own topic prefix rather than
 * cross-cutting on `search.*`.
 *
 * Convention: `<consumer>.<entity>.<action>`.
 *
 * The api emits these inside the same transaction as the entity write so
 * the outbox row is guaranteed-or-rolled-back. Workers reread the row
 * later — payload must be self-contained enough to recompute the action
 * without consulting the originating route's auth context.
 */

export const SEARCH_PROPERTY_UPSERT = "search.property.upsert" as const;
export const SEARCH_PROPERTY_DELETE = "search.property.delete" as const;

export const SearchPropertyUpsertPayload = z.object({
  propertyId: z.string().min(1),
  /** Locales to reindex. Empty = all locales the property has translations for. */
  locales: z.array(localeSchema).default([]),
  /** Set on full reindex passes so the worker can metric "reindex vs incremental". */
  reason: z
    .enum(["create", "update", "image_change", "feature_change", "reindex"])
    .default("update"),
});

export const SearchPropertyDeletePayload = z.object({
  propertyId: z.string().min(1),
  /** Empty = remove from every per-locale index. */
  locales: z.array(localeSchema).default([]),
  reason: z.enum(["soft_delete", "hard_delete", "visibility_changed"]).default("soft_delete"),
});

// Input types: caller-facing shape where defaulted fields are optional.
// Output types: post-parse shape used by consumers (worker) where the
// defaults are filled in. Splitting them keeps callers terse without
// losing the strong shape on the read side.
export type SearchPropertyUpsertPayloadInput = z.input<typeof SearchPropertyUpsertPayload>;
export type SearchPropertyUpsertPayloadT = z.infer<typeof SearchPropertyUpsertPayload>;
export type SearchPropertyDeletePayloadInput = z.input<typeof SearchPropertyDeletePayload>;
export type SearchPropertyDeletePayloadT = z.infer<typeof SearchPropertyDeletePayload>;

/**
 * Discriminated by `topic`. Workers parse the row's `payload` field with
 * the matching schema after switching on `topic`.
 */
export const OutboxTopic = z.enum([SEARCH_PROPERTY_UPSERT, SEARCH_PROPERTY_DELETE]);
export type OutboxTopicT = z.infer<typeof OutboxTopic>;
