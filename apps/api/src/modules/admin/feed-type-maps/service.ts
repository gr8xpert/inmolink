import { prisma } from "@inmolink/db";
import type { adminFeedTypeMapSchemas } from "@inmolink/shared";
import type { FeedConnectorKind, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../_shared/taxonomy";

type AdminFeedTypeMap = ReturnType<typeof adminFeedTypeMapSchemas.adminFeedTypeMapSchema.parse>;

/**
 * Super-admin curation of "raw label from feed → PropertyType" mappings.
 * The same source label can mean different things depending on the
 * connector, so the unique key is `(kind, sourceLabel)` with the label
 * canonicalised (trimmed, lower-cased) on every write.
 */

function canonicalLabel(label: string): string {
  return label.trim().toLowerCase();
}

async function decorate(
  rows: Array<{
    id: string;
    kind: FeedConnectorKind;
    sourceLabel: string;
    propertyTypeId: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
): Promise<AdminFeedTypeMap[]> {
  const ids = Array.from(new Set(rows.map((r) => r.propertyTypeId)));
  const types =
    ids.length > 0
      ? await prisma.propertyType.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            translations: { select: { name: true, locale: true } },
          },
        })
      : [];
  const nameById = new Map<string, string>();
  for (const t of types) {
    const en = t.translations.find((tr) => tr.locale === "en");
    nameById.set(t.id, (en ?? t.translations[0])?.name ?? "");
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    sourceLabel: r.sourceLabel,
    propertyTypeId: r.propertyTypeId,
    propertyTypeName: nameById.get(r.propertyTypeId) ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function listFeedTypeMaps(args: {
  kind?: FeedConnectorKind;
  q?: string;
}): Promise<{ items: AdminFeedTypeMap[] }> {
  const where: Prisma.FeedTypeMapWhereInput = {};
  if (args.kind) where.kind = args.kind;
  if (args.q?.trim()) {
    where.sourceLabel = { contains: args.q.trim().toLowerCase() };
  }

  const rows = await prisma.feedTypeMap.findMany({
    where,
    orderBy: [{ kind: "asc" }, { sourceLabel: "asc" }],
    take: 500,
  });
  const items = await decorate(rows);
  return { items };
}

export async function createFeedTypeMap(input: {
  kind: FeedConnectorKind;
  sourceLabel: string;
  propertyTypeId: string;
}): Promise<AdminFeedTypeMap> {
  const label = canonicalLabel(input.sourceLabel);
  if (!label) throw new ConflictError("sourceLabel cannot be empty");

  // Verify the PropertyType exists — Prisma will throw P2003 otherwise but
  // we want a friendly 404.
  const type = await prisma.propertyType.findUnique({ where: { id: input.propertyTypeId } });
  if (!type) throw new NotFoundError("PropertyType not found");

  try {
    const created = await prisma.feedTypeMap.create({
      data: { kind: input.kind, sourceLabel: label, propertyTypeId: input.propertyTypeId },
    });
    const [decorated] = await decorate([created]);
    if (!decorated) throw new Error("Failed to decorate FeedTypeMap row");
    return decorated;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError(
        `A mapping for ${input.kind} / "${label}" already exists. Edit it instead.`,
      );
    }
    throw err;
  }
}

export async function updateFeedTypeMap(
  id: string,
  input: { sourceLabel?: string; propertyTypeId?: string },
): Promise<AdminFeedTypeMap> {
  const existing = await prisma.feedTypeMap.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  if (input.propertyTypeId) {
    const type = await prisma.propertyType.findUnique({ where: { id: input.propertyTypeId } });
    if (!type) throw new NotFoundError("PropertyType not found");
  }

  const data: Prisma.FeedTypeMapUpdateInput = {};
  if (input.sourceLabel !== undefined) {
    const label = canonicalLabel(input.sourceLabel);
    if (!label) throw new ConflictError("sourceLabel cannot be empty");
    data.sourceLabel = label;
  }
  if (input.propertyTypeId !== undefined) {
    data.propertyType = { connect: { id: input.propertyTypeId } };
  }

  try {
    const updated = await prisma.feedTypeMap.update({ where: { id }, data });
    const [decorated] = await decorate([updated]);
    if (!decorated) throw new Error("Failed to decorate FeedTypeMap row");
    return decorated;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError("Another mapping with that (kind, sourceLabel) already exists.");
    }
    throw err;
  }
}

export async function deleteFeedTypeMap(id: string): Promise<{ ok: true }> {
  const existing = await prisma.feedTypeMap.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();
  await prisma.feedTypeMap.delete({ where: { id } });
  return { ok: true };
}
