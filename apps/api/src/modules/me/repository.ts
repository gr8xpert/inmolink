import { prisma } from "@inmolink/db";
import type { Prisma } from "@prisma/client";

/**
 * Thin Prisma layer for `/api/dashboard/me`. Service calls the auth helpers
 * + handles re-hashing; this file just talks to the DB.
 */

const meSelect = {
  id: true,
  email: true,
  role: true,
  agencyId: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  slug: true,
  photoR2Key: true,
  phone: true,
  whatsappNumber: true,
  bio: true,
  languagesSpoken: true,
  publicProfileEnabled: true,
  agency: { select: { name: true, slug: true } },
  settings: {
    select: {
      preferredLocale: true,
      notifyOnViewingRequest: true,
      notifyOnChatMessage: true,
      notifyOnLead: true,
      notifyOnDealEvent: true,
      notifyOnImportFailure: true,
      emailDigestFrequency: true,
      totpEnabledAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type MeRow = Prisma.UserGetPayload<{ select: typeof meSelect }>;

export async function getMe(userId: string): Promise<MeRow | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: meSelect });
}

export async function updateProfile(
  userId: string,
  data: Prisma.UserUpdateInput,
): Promise<MeRow | null> {
  return prisma.user.update({ where: { id: userId }, data, select: meSelect });
}

export async function setPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/**
 * Idempotent upsert — UserSettings is 1:1 and may not exist yet for accounts
 * created before Sprint 4 landed.
 */
export async function upsertSettings(
  userId: string,
  patch: Prisma.UserSettingsUpdateInput,
): Promise<MeRow["settings"]> {
  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { ...(patch as Prisma.UserSettingsUncheckedCreateInput), userId },
    update: patch,
    select: {
      preferredLocale: true,
      notifyOnViewingRequest: true,
      notifyOnChatMessage: true,
      notifyOnLead: true,
      notifyOnDealEvent: true,
      notifyOnImportFailure: true,
      emailDigestFrequency: true,
      totpEnabledAt: true,
    },
  });
  return row;
}
