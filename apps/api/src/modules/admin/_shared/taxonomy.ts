/**
 * Shared error classes + helpers for super-admin taxonomy services
 * (PropertyType, Feature, Location, LocationGroup). These were copy-pasted
 * across all four service.ts files; consolidating here removes the drift
 * risk without forcing a full factory abstraction (the four entities have
 * meaningfully different invariants — tree vs flat, m2m vs translations,
 * with/without slug — that resist a single generic implementation).
 *
 * Keep this file dependency-light: no Prisma imports, no ai imports. It's
 * referenced from every taxonomy service and will be auto-imported very
 * early in the load order.
 */

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "TAXONOMY_CONFLICT";
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Resource not found") {
    super(message);
  }
}

export class InvalidHierarchyError extends Error {
  readonly statusCode = 422;
  readonly code = "INVALID_HIERARCHY";
}

/**
 * Validate that the caller's reorder-all input matches the existing scope
 * exactly — same set of ids, no more, no less. Rejects stale clients
 * with a 409 ConflictError so a drag-drop in a half-stale tab doesn't
 * silently rewrite positions for a different set than the caller saw.
 *
 * Pass `entityName` ("group", "feature", "Location") to shape the error
 * message — the rest of the contract is identical across services.
 */
export function assertReorderSetMatch(
  existingIds: Iterable<string>,
  inputIds: Iterable<string>,
  entityName: string,
): void {
  const existing = new Set(existingIds);
  const input = new Set(inputIds);
  if (existing.size !== input.size) {
    throw new ConflictError(
      `Reorder set mismatch — ${entityName} catalog changed since you loaded it. Refresh and retry.`,
    );
  }
  for (const id of existing) {
    if (!input.has(id)) {
      throw new ConflictError(
        `Reorder set mismatch — ${entityName} catalog changed since you loaded it. Refresh and retry.`,
      );
    }
  }
}
