import { prisma } from "@inmolink/db";
import { adminLocationSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import {
  ConflictError,
  InvalidHierarchyError,
  NotFoundError,
  assertReorderSetMatch,
} from "../_shared/taxonomy.js";

/**
 * Super-admin curation for Location (4-level tree).
 *
 * Tree invariants enforced server-side:
 *  - COUNTRY has parentId=null; REGION/CITY/AREA require parentId.
 *  - The parent's level must be the immediate predecessor in the
 *    hierarchy (COUNTRY → REGION → CITY → AREA).
 *  - `level` and `parentId` are immutable on PATCH — re-parenting
 *    cascades through children and is risky enough to want a dedicated
 *    endpoint with explicit re-leveling rules. Not built today.
 *
 * Soft-deletion is NOT supported. DELETE returns 409 if any children
 * exist OR any Property rows reference the location. Admin must reassign
 * or set isActive=false to retire.
 *
 * The `findFirst({where:{position}})` swap-with-occupant pattern from
 * 2.A/2.B carries over but is scoped to the same parent (positions are
 * per-parent in the tree).
 */

const { VALID_CHILD_LEVEL } = adminLocationSchemas;

export { ConflictError, InvalidHierarchyError, NotFoundError } from "../_shared/taxonomy.js";

const LOCATION_SELECT = {
  id: true,
  level: true,
  parentId: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  position: true,
  isActive: true,
  translations: {
    select: {
      locale: true,
      name: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
    },
  },
  _count: { select: { children: true } },
} as const;

function toLocationDto(row: {
  id: string;
  level: "COUNTRY" | "REGION" | "CITY" | "AREA";
  parentId: string | null;
  countryCode: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  position: number;
  isActive: boolean;
  translations: {
    locale: string;
    name: string;
    slug: string;
    metaTitle: string | null;
    metaDescription: string | null;
  }[];
  _count: { children: number };
}) {
  return {
    id: row.id,
    level: row.level,
    parentId: row.parentId,
    countryCode: row.countryCode,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    position: row.position,
    isActive: row.isActive,
    translations: row.translations,
    childCount: row._count.children,
  };
}

export async function listLocations() {
  const rows = await prisma.location.findMany({
    select: LOCATION_SELECT,
    // Match the tree-view's natural sort: countries first, then by parent
    // and position within each level. The api returns flat; the client
    // builds the tree from `parentId`.
    orderBy: [{ level: "asc" }, { position: "asc" }],
  });
  return { items: rows.map(toLocationDto) };
}

async function assertValidParent(
  level: adminLocationSchemas.LocationLevel,
  parentId: string | null | undefined,
) {
  if (level === "COUNTRY") {
    if (parentId) {
      throw new InvalidHierarchyError("COUNTRY cannot have a parent");
    }
    return;
  }
  if (!parentId) {
    throw new InvalidHierarchyError(`${level} must have a parent`);
  }
  const parent = await prisma.location.findUnique({
    where: { id: parentId },
    select: { level: true },
  });
  if (!parent) throw new NotFoundError("Parent location not found");
  const expected = VALID_CHILD_LEVEL[parent.level as adminLocationSchemas.LocationLevel];
  if (expected !== level) {
    throw new InvalidHierarchyError(
      `Parent (${parent.level}) cannot have ${level} children — expected ${expected ?? "no children"}`,
    );
  }
}

export async function createLocation(input: adminLocationSchemas.AdminLocationCreate) {
  await assertValidParent(input.level, input.parentId ?? null);

  // Position auto-assigned to "next available within parent" when omitted.
  const max = await prisma.location.findFirst({
    where: { parentId: input.parentId ?? null, level: input.level },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);

  const created = await prisma.location.create({
    data: {
      level: input.level,
      parentId: input.parentId ?? null,
      countryCode: input.countryCode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      position,
      isActive: input.isActive,
      translations: { create: input.translations },
    },
    select: LOCATION_SELECT,
  });
  return toLocationDto(created);
}

export async function updateLocation(id: string, input: adminLocationSchemas.AdminLocationUpdate) {
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Location not found");

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      await tx.locationTranslation.deleteMany({ where: { locationId: id } });
      await tx.locationTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, locationId: id })),
      });
    }
    const updated = await tx.location.update({
      where: { id },
      data: {
        ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: LOCATION_SELECT,
    });
    return toLocationDto(updated);
  });
}

export async function deleteLocation(id: string) {
  const [childCount, propertyCount] = await Promise.all([
    prisma.location.count({ where: { parentId: id } }),
    prisma.property.count({ where: { locationId: id } }),
  ]);
  if (childCount > 0) {
    throw new ConflictError(
      `Cannot delete: ${childCount} child location(s). Move or remove them first.`,
    );
  }
  if (propertyCount > 0) {
    throw new ConflictError(
      `Cannot delete: ${propertyCount} Property row(s) still reference it. Reassign or set isActive=false to retire instead.`,
    );
  }
  try {
    await prisma.location.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("Location not found");
    }
    throw e;
  }
  return { ok: true as const };
}

/** Drag-and-drop reorder among siblings (same parent + same level).
 *  Different from property-types/features because Locations are scoped by
 *  (parentId, level) tuple — reordering "cities under Spain" is different
 *  from reordering "regions under Spain". */
export async function reorderAllLocations(
  parentId: string | null,
  level: adminLocationSchemas.LocationLevel,
  ids: string[],
) {
  const existing = await prisma.location.findMany({
    where: { parentId, level },
    select: { id: true },
  });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    `Location siblings (parent=${parentId ?? "root"}, level=${level})`,
  );
  await prisma.$transaction(
    ids.map((id, position) => prisma.location.update({ where: { id }, data: { position } })),
  );
  return { ok: true as const };
}

/** Re-parent a Location, same level only. The new parent's level must be
 *  the immediate predecessor (COUNTRY → REGION, REGION → CITY, CITY → AREA),
 *  matching the create-time hierarchy rule.
 *
 *  Implementation:
 *  - 422 if target is COUNTRY (no parent allowed)
 *  - 404 if newParentId doesn't exist
 *  - 422 if newParent.level + 1 !== target.level
 *  - 422 if newParent is the target itself or a descendant (would form a cycle)
 *  - position auto-assigned to end of new parent's siblings
 *  - countryCode is NOT propagated — admin must update separately if the move
 *    crosses a country boundary (rare; surface this in the UI before allowing it)
 *
 *  Descendants keep their parentId chain — only the `target.parentId` pointer
 *  changes, so the rest of the subtree comes along for free. */
export async function moveLocation(id: string, newParentId: string) {
  const target = await prisma.location.findUnique({
    where: { id },
    select: { id: true, level: true, parentId: true },
  });
  if (!target) throw new NotFoundError("Location not found");
  if (target.level === "COUNTRY") {
    throw new InvalidHierarchyError("COUNTRY rows cannot be moved (they have no parent)");
  }
  if (target.parentId === newParentId) {
    return { ok: true as const };
  }

  const newParent = await prisma.location.findUnique({
    where: { id: newParentId },
    select: { id: true, level: true },
  });
  if (!newParent) throw new NotFoundError("New parent not found");
  const expectedChild = VALID_CHILD_LEVEL[newParent.level as adminLocationSchemas.LocationLevel];
  if (expectedChild !== target.level) {
    throw new InvalidHierarchyError(
      `New parent (${newParent.level}) cannot have ${target.level} children — expected ${expectedChild ?? "no children"}`,
    );
  }

  // Cycle check: walk up newParent's ancestor chain — if we hit `target.id`,
  // this would create a cycle.
  let cursor: string | null = newParent.id;
  while (cursor) {
    if (cursor === target.id) {
      throw new InvalidHierarchyError("Cannot move a Location under itself or its own descendant");
    }
    const next: { parentId: string | null } | null = await prisma.location.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }

  const max = await prisma.location.findFirst({
    where: { parentId: newParentId, level: target.level },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = max ? max.position + 1 : 0;

  await prisma.location.update({
    where: { id },
    data: { parentId: newParentId, position },
  });
  return { ok: true as const };
}

export async function reorderLocation(id: string, position: number) {
  const target = await prisma.location.findUnique({
    where: { id },
    select: { id: true, parentId: true, level: true, position: true },
  });
  if (!target) throw new NotFoundError("Location not found");
  if (target.position === position) return { ok: true as const };

  // Reorder is scoped to siblings (same parent + level). Cross-parent moves
  // are out of scope for this slice (see `level`/`parentId` immutability).
  const occupant = await prisma.location.findFirst({
    where: { parentId: target.parentId, level: target.level, position },
  });
  await prisma.$transaction([
    prisma.location.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.location.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}
