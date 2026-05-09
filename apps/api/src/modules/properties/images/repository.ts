import { prisma } from "@inmolink/db";
import type { Storage } from "@inmolink/storage";

/**
 * Read-side projection — what `/images` endpoints return per row. Joined
 * with MediaObject so the client gets dimensions + bytes + the public
 * source URL without a second round-trip.
 *
 * Note: this returns the SOURCE original's URL. The client picks variant
 * URLs separately via /variants/resolve (slice G).
 */
export type PropertyImageRow = {
  id: string;
  propertyId: string;
  mediaObjectId: string;
  altText: string | null;
  position: number;
  isCover: boolean;
  createdAt: Date;
  mediaObject: {
    r2Key: string;
    bytes: number;
    width: number | null;
    height: number | null;
  };
};

const IMAGE_SELECT = {
  id: true,
  propertyId: true,
  mediaObjectId: true,
  altText: true,
  position: true,
  isCover: true,
  createdAt: true,
  mediaObject: { select: { r2Key: true, bytes: true, width: true, height: true } },
} as const;

export function toImageDto(storage: Storage, row: PropertyImageRow) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    mediaObjectId: row.mediaObjectId,
    altText: row.altText,
    position: row.position,
    isCover: row.isCover,
    publicUrl: storage.publicUrl(row.mediaObject.r2Key),
    bytes: row.mediaObject.bytes,
    width: row.mediaObject.width,
    height: row.mediaObject.height,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listImagesForProperty(propertyId: string): Promise<PropertyImageRow[]> {
  return prisma.propertyImage.findMany({
    where: { propertyId },
    select: IMAGE_SELECT,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getMaxImagePosition(propertyId: string): Promise<number> {
  const top = await prisma.propertyImage.findFirst({
    where: { propertyId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  return top?.position ?? -1;
}

export async function findImageById(propertyId: string, imageId: string) {
  return prisma.propertyImage.findFirst({
    where: { id: imageId, propertyId },
    select: IMAGE_SELECT,
  });
}
