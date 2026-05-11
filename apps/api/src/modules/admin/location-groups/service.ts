import { prisma } from "@inmolink/db";
import type { adminLocationGroupSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, assertReorderSetMatch } from "../_shared/taxonomy";

/**
 * Super-admin curation for LocationGroup + LocationGroupMember.
 *
 * Group lifecycle mirrors 2.C.1 (CRUD + reorder + 409 on conflict).
 * Membership ops are separate from PATCH: a typical edit only touches
 * one member at a time and the wholesale-replace pattern from 2.A/2.B
 * would force the picker UX into batched-diff territory.
 *
 * Member positions are scoped to the group; reorder is the same
 * swap-with-occupant idiom used elsewhere.
 */

export { ConflictError, NotFoundError } from "../_shared/taxonomy";

const GROUP_INCLUDE = {
  translations: {
    select: {
      locale: true,
      name: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
    },
  },
  members: {
    select: {
      locationId: true,
      position: true,
      location: {
        select: {
          level: true,
          countryCode: true,
          translations: { select: { locale: true, name: true } },
        },
      },
    },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.LocationGroupInclude;

function pickName(translations: Array<{ locale: string; name: string }>): string {
  return translations.find((t) => t.locale === "en")?.name ?? translations[0]?.name ?? "(unnamed)";
}

function toGroupDto(row: {
  id: string;
  position: number;
  isActive: boolean;
  translations: {
    locale: string;
    name: string;
    slug: string;
    metaTitle: string | null;
    metaDescription: string | null;
  }[];
  members: {
    locationId: string;
    position: number;
    location: {
      level: "COUNTRY" | "REGION" | "CITY" | "AREA";
      countryCode: string;
      translations: { locale: string; name: string }[];
    };
  }[];
}) {
  return {
    id: row.id,
    position: row.position,
    isActive: row.isActive,
    translations: row.translations,
    members: row.members.map((m) => ({
      locationId: m.locationId,
      position: m.position,
      name: pickName(m.location.translations),
      level: m.location.level,
      countryCode: m.location.countryCode,
    })),
  };
}

// ─── Group CRUD ─────────────────────────────────────────────────────────

export async function listGroups() {
  const rows = await prisma.locationGroup.findMany({
    include: GROUP_INCLUDE,
    orderBy: { position: "asc" },
  });
  return { items: rows.map(toGroupDto) };
}

export async function createGroup(input: adminLocationGroupSchemas.AdminLocationGroupCreate) {
  const max = await prisma.locationGroup.findFirst({
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = input.position ?? (max ? max.position + 1 : 0);
  const created = await prisma.locationGroup.create({
    data: {
      position,
      isActive: input.isActive,
      translations: { create: input.translations },
    },
    include: GROUP_INCLUDE,
  });
  return toGroupDto(created);
}

export async function updateGroup(
  id: string,
  input: adminLocationGroupSchemas.AdminLocationGroupUpdate,
) {
  const existing = await prisma.locationGroup.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("LocationGroup not found");

  return prisma.$transaction(async (tx) => {
    if (input.translations) {
      await tx.locationGroupTranslation.deleteMany({ where: { groupId: id } });
      await tx.locationGroupTranslation.createMany({
        data: input.translations.map((t) => ({ ...t, groupId: id })),
      });
    }
    const updated = await tx.locationGroup.update({
      where: { id },
      data: {
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: GROUP_INCLUDE,
    });
    return toGroupDto(updated);
  });
}

export async function deleteGroup(id: string) {
  // Members are cascade-deleted by Prisma's onDelete: Cascade on
  // LocationGroupMember. The group itself can always be removed —
  // cascading the m2m is cheap and we don't expose group ids in any
  // other table.
  try {
    await prisma.locationGroup.delete({ where: { id } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("LocationGroup not found");
    }
    throw e;
  }
  return { ok: true as const };
}

export async function reorderGroup(id: string, position: number) {
  const target = await prisma.locationGroup.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("LocationGroup not found");
  if (target.position === position) return { ok: true as const };

  const occupant = await prisma.locationGroup.findFirst({ where: { position } });
  await prisma.$transaction([
    prisma.locationGroup.update({ where: { id }, data: { position } }),
    ...(occupant
      ? [
          prisma.locationGroup.update({
            where: { id: occupant.id },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}

/** Drag-and-drop reorder of LocationGroups themselves. */
export async function reorderAllGroups(ids: string[]) {
  const existing = await prisma.locationGroup.findMany({ select: { id: true } });
  assertReorderSetMatch(
    existing.map((r) => r.id),
    ids,
    "LocationGroup",
  );
  await prisma.$transaction(
    ids.map((id, position) => prisma.locationGroup.update({ where: { id }, data: { position } })),
  );
  return { ok: true as const };
}

// ─── Membership ops ─────────────────────────────────────────────────────

export async function addMember(groupId: string, locationId: string, position?: number) {
  const [group, location] = await Promise.all([
    prisma.locationGroup.findUnique({ where: { id: groupId } }),
    prisma.location.findUnique({ where: { id: locationId } }),
  ]);
  if (!group) throw new NotFoundError("LocationGroup not found");
  if (!location) throw new NotFoundError("Location not found");

  const existing = await prisma.locationGroupMember.findUnique({
    where: { groupId_locationId: { groupId, locationId } },
  });
  if (existing) {
    throw new ConflictError("Location is already a member of this group");
  }

  const max = await prisma.locationGroupMember.findFirst({
    where: { groupId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const pos = position ?? (max ? max.position + 1 : 0);

  await prisma.locationGroupMember.create({
    data: { groupId, locationId, position: pos },
  });
  return { ok: true as const };
}

export async function removeMember(groupId: string, locationId: string) {
  try {
    await prisma.locationGroupMember.delete({
      where: { groupId_locationId: { groupId, locationId } },
    });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2025") {
      throw new NotFoundError("Membership not found");
    }
    throw e;
  }
  return { ok: true as const };
}

/** Drag-and-drop reorder of all members within a group. Validates every
 *  input locationId is currently a member of the group. */
export async function reorderAllMembers(groupId: string, locationIds: string[]) {
  const existing = await prisma.locationGroupMember.findMany({
    where: { groupId },
    select: { locationId: true },
  });
  assertReorderSetMatch(
    existing.map((m) => m.locationId),
    locationIds,
    `LocationGroup members (group=${groupId})`,
  );
  await prisma.$transaction(
    locationIds.map((locationId, position) =>
      prisma.locationGroupMember.update({
        where: { groupId_locationId: { groupId, locationId } },
        data: { position },
      }),
    ),
  );
  return { ok: true as const };
}

export async function reorderMember(groupId: string, locationId: string, position: number) {
  const target = await prisma.locationGroupMember.findUnique({
    where: { groupId_locationId: { groupId, locationId } },
  });
  if (!target) throw new NotFoundError("Membership not found");
  if (target.position === position) return { ok: true as const };

  const occupant = await prisma.locationGroupMember.findFirst({
    where: { groupId, position },
  });
  await prisma.$transaction([
    prisma.locationGroupMember.update({
      where: { groupId_locationId: { groupId, locationId } },
      data: { position },
    }),
    ...(occupant
      ? [
          prisma.locationGroupMember.update({
            where: {
              groupId_locationId: { groupId, locationId: occupant.locationId },
            },
            data: { position: target.position },
          }),
        ]
      : []),
  ]);
  return { ok: true as const };
}
