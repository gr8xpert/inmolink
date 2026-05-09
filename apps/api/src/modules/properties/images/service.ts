import { prisma } from "@inmolink/db";
import type { propertyImageSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { AuthenticatedUser } from "../../../plugins/auth.js";
import { getPropertyById } from "../repository.js";
import { ForbiddenError, NotFoundError } from "../service.js";
import {
  findImageById,
  getMaxImagePosition,
  listImagesForProperty,
  toImageDto,
} from "./repository.js";

/**
 * PropertyImage attach / patch / delete service. Slice E.
 *
 * RefCount semantics (PLAN §5.1):
 *  - /uploads/register inserts MediaObject with refCount=0 + 24h
 *    scheduledDeleteAt grace.
 *  - attach: increment refCount + clear scheduledDeleteAt (it's now in use).
 *  - detach: decrement refCount; if 0, schedule delete = NOW()+7d (the
 *    cleanup worker will hard-delete past the grace).
 *
 * Cover uniqueness: only one PropertyImage per property may have isCover=true.
 * Enforced in app code (no partial unique index in the schema yet).
 */

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

function ownershipMatches(
  user: AuthenticatedUser,
  property: { ownerUserId: string; ownerAgencyId: string },
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "AGENCY_ADMIN" && user.agencyId === property.ownerAgencyId) return true;
  if (user.role === "AGENT" && user.id === property.ownerUserId) return true;
  return false;
}

async function assertOwnedProperty(user: AuthenticatedUser, propertyId: string) {
  const property = await getPropertyById(propertyId);
  if (!property) throw new NotFoundError("Property not found");
  if (!ownershipMatches(user, property)) throw new ForbiddenError();
  return property;
}

export class MediaObjectMissingError extends Error {
  readonly statusCode = 422;
  readonly code = "MEDIA_OBJECT_MISSING";
}

export class InvalidMediaTypeError extends Error {
  readonly statusCode = 422;
  readonly code = "INVALID_MEDIA_TYPE";
}

export async function attachImagesForUser(
  storage: Storage,
  user: AuthenticatedUser,
  propertyId: string,
  req: propertyImageSchemas.AttachPropertyImagesRequest,
) {
  await assertOwnedProperty(user, propertyId);

  const ids = req.images.map((i) => i.mediaObjectId);
  const sources = await prisma.mediaObject.findMany({
    where: { id: { in: ids } },
    select: { id: true, mimeType: true },
  });
  const sourceById = new Map(sources.map((m) => [m.id, m]));
  for (const item of req.images) {
    const src = sourceById.get(item.mediaObjectId);
    if (!src) {
      throw new MediaObjectMissingError(`MediaObject ${item.mediaObjectId} not found`);
    }
    if (!src.mimeType.startsWith("image/")) {
      throw new InvalidMediaTypeError(
        `MediaObject ${item.mediaObjectId} is ${src.mimeType}, not an image`,
      );
    }
  }

  const wantsCover = req.images.some((i) => i.isCover === true);
  const startPosition = (await getMaxImagePosition(propertyId)) + 1;

  // Single transaction: create all PropertyImage rows + bump each
  // MediaObject refCount + clear orphan-grace + (if a cover is supplied)
  // unset existing cover on this property. Either all or none.
  const created = await prisma.$transaction(async (tx) => {
    if (wantsCover) {
      await tx.propertyImage.updateMany({
        where: { propertyId, isCover: true },
        data: { isCover: false },
      });
    }

    const rows = [] as Awaited<ReturnType<typeof tx.propertyImage.create>>[];
    let idx = 0;
    for (const item of req.images) {
      const row = await tx.propertyImage.create({
        data: {
          propertyId,
          mediaObjectId: item.mediaObjectId,
          altText: item.altText ?? null,
          position: item.position ?? startPosition + idx,
          isCover: item.isCover ?? false,
        },
      });
      await tx.mediaObject.update({
        where: { id: item.mediaObjectId },
        data: { refCount: { increment: 1 }, scheduledDeleteAt: null },
      });
      rows.push(row);
      idx++;
    }
    return rows;
  });

  const ordered = await listImagesForProperty(propertyId);
  const createdIds = new Set(created.map((r) => r.id));
  return {
    images: ordered.filter((r) => createdIds.has(r.id)).map((r) => toImageDto(storage, r)),
  };
}

export async function patchImageForUser(
  storage: Storage,
  user: AuthenticatedUser,
  propertyId: string,
  imageId: string,
  body: propertyImageSchemas.PatchPropertyImageRequest,
) {
  await assertOwnedProperty(user, propertyId);
  const existing = await findImageById(propertyId, imageId);
  if (!existing) throw new NotFoundError("PropertyImage not found");

  const updated = await prisma.$transaction(async (tx) => {
    if (body.isCover === true) {
      await tx.propertyImage.updateMany({
        where: { propertyId, isCover: true, NOT: { id: imageId } },
        data: { isCover: false },
      });
    }
    return tx.propertyImage.update({
      where: { id: imageId },
      data: {
        ...(body.altText !== undefined ? { altText: body.altText } : {}),
        ...(body.isCover !== undefined ? { isCover: body.isCover } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      },
      select: {
        id: true,
        propertyId: true,
        mediaObjectId: true,
        altText: true,
        position: true,
        isCover: true,
        createdAt: true,
        mediaObject: { select: { r2Key: true, bytes: true, width: true, height: true } },
      },
    });
  });

  return { image: toImageDto(storage, updated) };
}

export async function deleteImageForUser(
  user: AuthenticatedUser,
  propertyId: string,
  imageId: string,
) {
  await assertOwnedProperty(user, propertyId);
  const existing = await findImageById(propertyId, imageId);
  if (!existing) throw new NotFoundError("PropertyImage not found");

  await prisma.$transaction(async (tx) => {
    await tx.propertyImage.delete({ where: { id: imageId } });
    const updated = await tx.mediaObject.update({
      where: { id: existing.mediaObjectId },
      data: { refCount: { decrement: 1 } },
      select: { refCount: true },
    });
    if (updated.refCount <= 0) {
      // PLAN §5.1: 7-day grace before physical delete. Worker reaps past it.
      await tx.mediaObject.update({
        where: { id: existing.mediaObjectId },
        data: { scheduledDeleteAt: new Date(Date.now() + SEVEN_DAYS_MS) },
      });
    }
  });

  return { ok: true as const };
}
