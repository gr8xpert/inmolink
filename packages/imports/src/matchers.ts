/**
 * Taxonomy matchers (PLAN §11.5).
 *
 * The connector emits plain text — `<type>Townhouse</type>`,
 * `<town>Cómpeta</town>`, `<feature><en>Sea View</en></feature>`. The
 * worker has to decide which `PropertyType` / `Location` / `Feature` row
 * each one points to, or surface "no match" so the property goes to DRAFT.
 *
 * Strategy:
 * - Type: super-admin curated `FeedTypeMap(kind, sourceLabel)` is checked
 *   first. On miss, fall back to a case-insensitive PropertyTypeTranslation
 *   name match. Still no luck → return null and the worker drafts.
 * - Town: case-insensitive LocationTranslation name match scoped to the
 *   target country. Province is a tie-breaker when more than one match —
 *   prefer the location whose ancestry contains the province.
 * - Feature: case-insensitive FeatureTranslation name match across any
 *   locale. Multiple unique matches are returned; unmatched names list is
 *   surfaced so super-admin can extend the catalog.
 *
 * All matchers are pure with respect to inputs (no logging, no mutation).
 */

import { prisma } from "@inmolink/db";
import type { FeedConnectorKind } from "./connector";

export type TypeMatchResult =
  | { matched: true; propertyTypeId: string; via: "feed-type-map" | "translation" }
  | { matched: false };

export async function findPropertyTypeForFeed(args: {
  kind: FeedConnectorKind;
  sourceLabel: string;
}): Promise<TypeMatchResult> {
  const label = args.sourceLabel.trim().toLowerCase();
  if (!label) return { matched: false };

  const mapped = await prisma.feedTypeMap.findUnique({
    where: { kind_sourceLabel: { kind: args.kind, sourceLabel: label } },
  });
  if (mapped) {
    return { matched: true, propertyTypeId: mapped.propertyTypeId, via: "feed-type-map" };
  }

  // Fallback: any locale's translation matches the label exactly (CI).
  const translation = await prisma.propertyTypeTranslation.findFirst({
    where: { name: { equals: args.sourceLabel.trim(), mode: "insensitive" } },
    select: { typeId: true },
  });
  if (translation) {
    return { matched: true, propertyTypeId: translation.typeId, via: "translation" };
  }

  return { matched: false };
}

export type LocationMatchResult =
  | { matched: true; locationId: string; ambiguous: boolean }
  | { matched: false };

/**
 * Case-insensitive city match scoped to the target country. When multiple
 * cities share the same name (Cordoba in Spain & Argentina, etc.) the
 * caller-provided `provinceName` is consulted as a tie-breaker.
 */
export async function findLocationForTown(args: {
  townName: string;
  provinceName?: string;
  countryCode: string;
}): Promise<LocationMatchResult> {
  const candidates = await prisma.locationTranslation.findMany({
    where: {
      name: { equals: args.townName.trim(), mode: "insensitive" },
      location: { is: { countryCode: args.countryCode, level: "CITY", isActive: true } },
    },
    select: {
      locationId: true,
      location: { select: { id: true, parentId: true, countryCode: true } },
    },
  });
  if (candidates.length === 0) return { matched: false };
  if (candidates.length === 1) {
    const first = candidates[0];
    if (!first) return { matched: false };
    return { matched: true, locationId: first.locationId, ambiguous: false };
  }

  if (args.provinceName) {
    // Walk parents looking for a region that matches the province name.
    const candidateIds = candidates.map((c) => c.locationId);
    const parents = await prisma.location.findMany({
      where: { id: { in: candidates.map((c) => c.location.parentId).filter(notNull) } },
      select: { id: true, translations: { select: { name: true } } },
    });
    const provinceLower = args.provinceName.trim().toLowerCase();
    const matchedParent = parents.find((p) =>
      p.translations.some((t) => t.name.trim().toLowerCase() === provinceLower),
    );
    if (matchedParent) {
      const winner = candidates.find((c) => c.location.parentId === matchedParent.id);
      if (winner) {
        return { matched: true, locationId: winner.locationId, ambiguous: false };
      }
    }
    void candidateIds;
  }

  // Multiple matches with no winning tie-breaker: surface as ambiguous so
  // the worker can route the property to DRAFT.
  const first = candidates[0];
  if (!first) return { matched: false };
  return { matched: true, locationId: first.locationId, ambiguous: true };
}

export type FeatureMatchResult = {
  /** Feature.id values that mapped from the input names (deduplicated). */
  matchedFeatureIds: string[];
  /** Names from the input that couldn't be matched — useful for super-admin alerts. */
  unmatchedNames: string[];
};

export async function findFeatureIdsByName(names: readonly string[]): Promise<FeatureMatchResult> {
  const trimmed = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)));
  if (trimmed.length === 0) return { matchedFeatureIds: [], unmatchedNames: [] };

  // citext-like match across translations (any locale). One round trip.
  const lowered = trimmed.map((n) => n.toLowerCase());
  const translations = await prisma.featureTranslation.findMany({
    where: {
      name: {
        in: trimmed,
        mode: "insensitive",
      },
      feature: { is: { isActive: true } },
    },
    select: { featureId: true, name: true },
  });

  const matchedNamesLower = new Set(translations.map((t) => t.name.trim().toLowerCase()));
  const matchedIds = Array.from(new Set(translations.map((t) => t.featureId)));
  const unmatched = trimmed.filter((n) => !matchedNamesLower.has(n.toLowerCase()));
  void lowered;

  return { matchedFeatureIds: matchedIds, unmatchedNames: unmatched };
}

function notNull<T>(v: T | null | undefined): v is T {
  return v != null;
}
