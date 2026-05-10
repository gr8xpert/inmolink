import { suggestIcon } from "@inmolink/ai";
import { prisma } from "@inmolink/db";
import type { adminFeatureSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, assertReorderSetMatch } from "../_shared/taxonomy.js";

/**
 * Super-admin curation for FeatureGroup + Feature. Mirror of admin/
 * property-types but for amenities — Lucide-only icons, no slug.
 *
 * Soft-deletion is NOT supported: Feature.id is referenced by every
 * PropertyFeature row. Hard delete returns 409 if in use; admin must
 * reassign or set isActive=false to retire.
 */

export { ConflictError, NotFoundError } from "../_shared/taxonomy.js";

// Amenity-focused Lucide subset — different from PropertyType's catalog.
const FEATURE_ICON_CATALOG = [
  "waves",
  "umbrella",
  "umbrella-off",
  "snowflake",
  "flame",
  "wifi",
  "tv",
  "bath",
  "bed",
  "armchair",
  "shower-head",
  "car",
  "parking-circle",
  "circle-parking",
  "trees",
  "tree-pine",
  "leaf",
  "flower",
  "mountain",
  "sun",
  "sunset",
  "ship",
  "anchor",
  "fish",
  "dog",
  "cat",
  "wrench",
  "hammer",
  "lock",
  "shield",
  "shield-check",
  "key",
  "key-round",
  "elevator",
  "stairs",
  "fence",
  "warehouse",
  "store",
  "shopping-bag",
  "school",
  "dumbbell",
  "bike",
] as const;

// ─── FeatureGroup ────────────────────────────────────────────────────────

export async function listGroups() {
  const rows = await prisma.featureGroup.findMany({
    select: {
      id: true,
      position: true,
      isActive: true,
      translations: { select: { locale: true, name: true } },
    },
    orderBy: { position: "asc" },
  });
  return { items: rows };
}

export async function createGroup(input: adminFeatureSchemas.AdminFeatureGroupCreate) {
  const max = await prisma.featureGroup.findFirst({
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);
  const created = await prisma.featureGroup.create({
    data: {
      position,
      isActive: input.isActive,
      translations: { create: input.translations },
    },
    select: {
      id: true,
      position: true,
      isActive: true,
      translations: { select: { locale: true, name: true } },
    },
  });
  return created;
}

export async function updateGroup(id: string, input: adminFeatureSchemas.AdminFeatureGroupUpdate) {
  const existing = await prisma.featureGroup.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("FeatureGroup not found");

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      await tx.featureGroupTranslation.deleteMany({ where: { groupId: id } });
      await tx.featureGroupTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, groupId: id })),
      });
    }
    return tx.featureGroup.update({
      where: { id },
      data: {
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: {
        id: true,
        position: true,
        isActive: true,
        translations: { select: { locale: true, name: true } },
      },
    });
  });
}

export async function deleteGroup(id: string) {
  const childCount = await prisma.feature.count({ where: { groupId: id } });
  if (childCount > 0) {
    throw new ConflictError(
      `Cannot delete group: ${childCount} Feature(s) still reference it. Move or remove them first.`,
    );
  }
  try {
    await prisma.featureGroup.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("FeatureGroup not found");
    }
    throw e;
  }
  return { ok: true as const };
}

export async function reorderGroup(id: string, position: number) {
  const target = await prisma.featureGroup.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("FeatureGroup not found");
  if (target.position === position) return { ok: true as const };

  const occupant = await prisma.featureGroup.findFirst({ where: { position } });
  await prisma.$transaction([
    prisma.featureGroup.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.featureGroup.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}

/** Drag-and-drop reorder: caller sends full ordered ids, api validates set
 *  match (409 if siblings changed since the client snapshot) and rewrites
 *  positions 0..n-1 atomically. */
export async function reorderAllGroups(ids: string[]) {
  const existing = await prisma.featureGroup.findMany({ select: { id: true } });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    "FeatureGroup",
  );
  await prisma.$transaction(
    ids.map((id, position) => prisma.featureGroup.update({ where: { id }, data: { position } })),
  );
  return { ok: true as const };
}

// ─── Feature ────────────────────────────────────────────────────────────

const FEATURE_SELECT = {
  id: true,
  groupId: true,
  position: true,
  isActive: true,
  iconName: true,
  iconAiSuggestedAt: true,
  iconAdminOverrode: true,
  translations: { select: { locale: true, name: true } },
} as const;

function toFeatureDto(row: {
  id: string;
  groupId: string;
  position: number;
  isActive: boolean;
  iconName: string | null;
  iconAiSuggestedAt: Date | null;
  iconAdminOverrode: boolean;
  translations: { locale: string; name: string }[];
}) {
  return {
    ...row,
    iconAiSuggestedAt: row.iconAiSuggestedAt ? row.iconAiSuggestedAt.toISOString() : null,
  };
}

export async function listFeatures() {
  const rows = await prisma.feature.findMany({
    select: FEATURE_SELECT,
    orderBy: [{ groupId: "asc" }, { position: "asc" }],
  });
  return { items: rows.map(toFeatureDto) };
}

export async function createFeature(input: adminFeatureSchemas.AdminFeatureCreate) {
  const group = await prisma.featureGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new NotFoundError("Group not found");

  const max = await prisma.feature.findFirst({
    where: { groupId: input.groupId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);

  const created = await prisma.feature.create({
    data: {
      groupId: input.groupId,
      position,
      isActive: input.isActive,
      iconName: input.iconName ?? null,
      iconAdminOverrode: input.iconName !== undefined && input.iconName !== null,
      translations: { create: input.translations },
    },
    select: FEATURE_SELECT,
  });
  return toFeatureDto(created);
}

export async function updateFeature(id: string, input: adminFeatureSchemas.AdminFeatureUpdate) {
  const existing = await prisma.feature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Feature not found");

  const iconChanged = input.iconName !== undefined;

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      await tx.featureTranslation.deleteMany({ where: { featureId: id } });
      await tx.featureTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, featureId: id })),
      });
    }
    const updated = await tx.feature.update({
      where: { id },
      data: {
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
        ...(iconChanged ? { iconAdminOverrode: true } : {}),
        ...(input.iconAdminOverrode !== undefined
          ? { iconAdminOverrode: input.iconAdminOverrode }
          : {}),
      },
      select: FEATURE_SELECT,
    });
    return toFeatureDto(updated);
  });
}

export async function deleteFeature(id: string) {
  const useCount = await prisma.propertyFeature.count({ where: { featureId: id } });
  if (useCount > 0) {
    throw new ConflictError(
      `Cannot delete feature: ${useCount} Property row(s) still reference it. Set isActive=false to retire instead.`,
    );
  }
  try {
    await prisma.feature.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("Feature not found");
    }
    throw e;
  }
  return { ok: true as const };
}

export async function reorderFeature(id: string, position: number) {
  const target = await prisma.feature.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("Feature not found");
  if (target.position === position) return { ok: true as const };

  // Reorder is scoped to the group — moving across groups is `updateFeature`.
  const occupant = await prisma.feature.findFirst({
    where: { groupId: target.groupId, position },
  });
  await prisma.$transaction([
    prisma.feature.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.feature.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}

/** Drag-and-drop reorder for features within a group. */
export async function reorderAllFeatures(groupId: string, ids: string[]) {
  const existing = await prisma.feature.findMany({
    where: { groupId },
    select: { id: true },
  });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    "Feature (within group)",
  );
  await prisma.$transaction(
    ids.map((id, position) => prisma.feature.update({ where: { id }, data: { position } })),
  );
  return { ok: true as const };
}

export async function suggestFeatureIcon(name: string, hint?: string) {
  const iconName = await suggestIcon({
    name,
    hint: hint ?? "Feature (amenity)",
    catalog: FEATURE_ICON_CATALOG,
  });
  return { iconName };
}

export async function acceptAiIcon(featureId: string, iconName: string) {
  const existing = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!existing) throw new NotFoundError("Feature not found");
  const updated = await prisma.feature.update({
    where: { id: featureId },
    data: {
      iconName,
      iconAiSuggestedAt: new Date(),
      iconAdminOverrode: false,
    },
    select: FEATURE_SELECT,
  });
  return toFeatureDto(updated);
}
