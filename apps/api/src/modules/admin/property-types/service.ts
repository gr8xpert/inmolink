import { suggestIcon } from "@inmolink/ai";
import { prisma } from "@inmolink/db";
import type { adminPropertyTypeSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, assertReorderSetMatch } from "../_shared/taxonomy";

/**
 * Super-admin curation for PropertyTypeGroup + PropertyType.
 *
 * RBAC is enforced upstream in the route via `request.requireSuperAdmin()` —
 * this service assumes the caller is a super-admin. Don't call directly
 * without that gate.
 *
 * Soft-deletion is NOT supported: PropertyType.id is referenced by every
 * Property row, so a hard delete would orphan data. The api returns 409
 * Conflict if the admin tries to delete a type that's still in use; they
 * must reassign or de-activate instead (`isActive: false` keeps the row
 * but hides it from agent dashboards via the `where: { isActive: true }`
 * read filter applied by /api/dashboard/property-types).
 */

export { ConflictError, NotFoundError } from "../_shared/taxonomy";

const SUGGEST_ICON_CATALOG = [
  "building",
  "building-2",
  "home",
  "house",
  "castle",
  "warehouse",
  "store",
  "trees",
  "tree-pine",
  "tent",
  "ship",
  "anchor",
  "mountain",
  "sun",
  "umbrella",
  "bed",
  "bath",
  "car",
  "parking-circle",
  "school",
  "shopping-bag",
  "factory",
  "hotel",
  "key",
  "key-round",
] as const;

// ─── PropertyTypeGroup ───────────────────────────────────────────────────

export async function listGroups() {
  const rows = await prisma.propertyTypeGroup.findMany({
    select: {
      id: true,
      position: true,
      isActive: true,
      translations: { select: { locale: true, name: true, slug: true } },
    },
    orderBy: { position: "asc" },
  });
  return { items: rows };
}

export async function createGroup(input: adminPropertyTypeSchemas.AdminPropertyTypeGroupCreate) {
  const max = await prisma.propertyTypeGroup.findFirst({
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);
  const created = await prisma.propertyTypeGroup.create({
    data: {
      position,
      isActive: input.isActive,
      translations: { create: input.translations },
    },
    select: {
      id: true,
      position: true,
      isActive: true,
      translations: { select: { locale: true, name: true, slug: true } },
    },
  });
  return created;
}

export async function updateGroup(
  id: string,
  input: adminPropertyTypeSchemas.AdminPropertyTypeGroupUpdate,
) {
  const existing = await prisma.propertyTypeGroup.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("PropertyTypeGroup not found");

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      // Replace the translation set wholesale — simpler than computing diffs.
      await tx.propertyTypeGroupTranslation.deleteMany({ where: { groupId: id } });
      await tx.propertyTypeGroupTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, groupId: id })),
      });
    }
    const updated = await tx.propertyTypeGroup.update({
      where: { id },
      data: {
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: {
        id: true,
        position: true,
        isActive: true,
        translations: { select: { locale: true, name: true, slug: true } },
      },
    });
    return updated;
  });
}

export async function deleteGroup(id: string) {
  const childCount = await prisma.propertyType.count({ where: { groupId: id } });
  if (childCount > 0) {
    throw new ConflictError(
      `Cannot delete group: ${childCount} PropertyType(s) still reference it. Move or remove them first.`,
    );
  }
  try {
    await prisma.propertyTypeGroup.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("PropertyTypeGroup not found");
    }
    throw e;
  }
  return { ok: true as const };
}

export async function reorderGroup(id: string, position: number) {
  const target = await prisma.propertyTypeGroup.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("PropertyTypeGroup not found");
  if (target.position === position) return { ok: true as const };

  // Find the row currently at the requested position and swap.
  const occupant = await prisma.propertyTypeGroup.findFirst({ where: { position } });
  await prisma.$transaction([
    prisma.propertyTypeGroup.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.propertyTypeGroup.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}

/** Drag-and-drop reorder. Caller sends the full ordered list of group
 *  ids; we set positions 0..n-1 in a single transaction. Validates that
 *  the set of ids exactly matches the existing group set so a stale
 *  client can't drop in a mutated catalog and silently lose rows. */
export async function reorderAllGroups(ids: string[]) {
  const existing = await prisma.propertyTypeGroup.findMany({ select: { id: true } });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    "PropertyTypeGroup",
  );
  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.propertyTypeGroup.update({ where: { id }, data: { position } }),
    ),
  );
  return { ok: true as const };
}

// ─── PropertyType ────────────────────────────────────────────────────────

const TYPE_SELECT = {
  id: true,
  groupId: true,
  position: true,
  isActive: true,
  iconKind: true,
  iconName: true,
  iconR2Key: true,
  iconAiSuggestedAt: true,
  iconAdminOverrode: true,
  translations: { select: { locale: true, name: true, slug: true } },
} as const;

function toTypeDto(row: {
  id: string;
  groupId: string;
  position: number;
  isActive: boolean;
  iconKind: "LIBRARY" | "CUSTOM";
  iconName: string | null;
  iconR2Key: string | null;
  iconAiSuggestedAt: Date | null;
  iconAdminOverrode: boolean;
  translations: { locale: string; name: string; slug: string }[];
}) {
  return {
    ...row,
    iconAiSuggestedAt: row.iconAiSuggestedAt ? row.iconAiSuggestedAt.toISOString() : null,
  };
}

export async function listTypes() {
  const rows = await prisma.propertyType.findMany({
    select: TYPE_SELECT,
    orderBy: [{ groupId: "asc" }, { position: "asc" }],
  });
  return { items: rows.map(toTypeDto) };
}

export async function createType(input: adminPropertyTypeSchemas.AdminPropertyTypeCreate) {
  // Validate group exists before creating to avoid a confusing FK error.
  const group = await prisma.propertyTypeGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new NotFoundError("Group not found");

  const max = await prisma.propertyType.findFirst({
    where: { groupId: input.groupId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);

  const created = await prisma.propertyType.create({
    data: {
      groupId: input.groupId,
      position,
      isActive: input.isActive,
      iconKind: input.iconKind,
      iconName: input.iconName ?? null,
      iconR2Key: input.iconR2Key ?? null,
      // Admin-set on create; AI suggestion only happens via /suggest-icon.
      iconAdminOverrode: input.iconName !== undefined || input.iconR2Key !== undefined,
      translations: { create: input.translations },
    },
    select: TYPE_SELECT,
  });
  return toTypeDto(created);
}

export async function updateType(
  id: string,
  input: adminPropertyTypeSchemas.AdminPropertyTypeUpdate,
) {
  const existing = await prisma.propertyType.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("PropertyType not found");

  // Any admin write to iconName/iconR2Key locks against future AI suggestions.
  const iconChanged =
    input.iconName !== undefined || input.iconR2Key !== undefined || input.iconKind !== undefined;

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      await tx.propertyTypeTranslation.deleteMany({ where: { typeId: id } });
      await tx.propertyTypeTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, typeId: id })),
      });
    }
    const updated = await tx.propertyType.update({
      where: { id },
      data: {
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.iconKind !== undefined ? { iconKind: input.iconKind } : {}),
        ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
        ...(input.iconR2Key !== undefined ? { iconR2Key: input.iconR2Key } : {}),
        ...(iconChanged ? { iconAdminOverrode: true } : {}),
        ...(input.iconAdminOverrode !== undefined
          ? { iconAdminOverrode: input.iconAdminOverrode }
          : {}),
      },
      select: TYPE_SELECT,
    });
    return toTypeDto(updated);
  });
}

export async function deleteType(id: string) {
  const useCount = await prisma.property.count({ where: { propertyTypeId: id } });
  if (useCount > 0) {
    throw new ConflictError(
      `Cannot delete type: ${useCount} Property row(s) still reference it. Set isActive=false to retire instead.`,
    );
  }
  try {
    await prisma.propertyType.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("PropertyType not found");
    }
    throw e;
  }
  return { ok: true as const };
}

export async function reorderType(id: string, position: number) {
  const target = await prisma.propertyType.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("PropertyType not found");
  if (target.position === position) return { ok: true as const };

  // Reorder is scoped to the group — moving across groups is `updateType`.
  const occupant = await prisma.propertyType.findFirst({
    where: { groupId: target.groupId, position },
  });
  await prisma.$transaction([
    prisma.propertyType.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.propertyType.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}

/** Drag-and-drop reorder for types within a single group. Validates
 *  that every input id belongs to that group so a stale client can't
 *  reorder rows it doesn't see. */
export async function reorderAllTypes(groupId: string, ids: string[]) {
  const existing = await prisma.propertyType.findMany({
    where: { groupId },
    select: { id: true },
  });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    "PropertyType (within group)",
  );
  await prisma.$transaction(
    ids.map((id, position) => prisma.propertyType.update({ where: { id }, data: { position } })),
  );
  return { ok: true as const };
}

export async function suggestTypeIcon(name: string, hint?: string) {
  const iconName = await suggestIcon({
    name,
    hint: hint ?? "PropertyType",
    catalog: SUGGEST_ICON_CATALOG,
  });
  return { iconName };
}

/** Mark an AI-suggested icon as accepted. Sets iconAiSuggestedAt + clears
 *  iconAdminOverrode so a fresh suggestion can run again later if needed. */
export async function acceptAiIcon(typeId: string, iconName: string) {
  const existing = await prisma.propertyType.findUnique({ where: { id: typeId } });
  if (!existing) throw new NotFoundError("PropertyType not found");
  const updated = await prisma.propertyType.update({
    where: { id: typeId },
    data: {
      iconKind: "LIBRARY",
      iconName,
      iconR2Key: null,
      iconAiSuggestedAt: new Date(),
      iconAdminOverrode: false,
    },
    select: TYPE_SELECT,
  });
  return toTypeDto(updated);
}
