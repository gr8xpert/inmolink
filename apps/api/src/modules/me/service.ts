import { hashPassword, verifyPassword } from "@inmolink/auth";
import type { meSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";
import { type MeRow, getMe, setPasswordHash, updateProfile, upsertSettings } from "./repository";

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}

export class IncorrectPasswordError extends Error {
  readonly statusCode = 401;
  readonly code = "INCORRECT_PASSWORD";
  constructor() {
    super("Current password is incorrect");
  }
}

const DEFAULT_SETTINGS: meSchemas.UserSettingsT = {
  preferredLocale: "en",
  notifyOnViewingRequest: true,
  notifyOnChatMessage: true,
  notifyOnLead: true,
  notifyOnDealEvent: true,
  notifyOnImportFailure: true,
  emailDigestFrequency: "INSTANT",
};

/** Read the signed-in user's full profile + settings. */
export async function getMeForUser(
  user: AuthenticatedUser,
  storage: Storage,
): Promise<meSchemas.MeDetail> {
  const row = await getMe(user.id);
  if (!row) throw new NotFoundError("User not found");
  return toDetail(row, storage);
}

export async function updateMyProfile(
  user: AuthenticatedUser,
  input: meSchemas.ProfileUpdateInput,
  storage: Storage,
): Promise<meSchemas.MeDetail> {
  const data: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.photoR2Key !== undefined) data.photoR2Key = input.photoR2Key ?? null;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.whatsappNumber !== undefined) data.whatsappNumber = input.whatsappNumber ?? null;
  if (input.bio !== undefined) data.bio = input.bio ?? null;
  if (input.languagesSpoken !== undefined) data.languagesSpoken = input.languagesSpoken;
  if (input.publicProfileEnabled !== undefined)
    data.publicProfileEnabled = input.publicProfileEnabled;

  try {
    const updated = await updateProfile(user.id, data);
    if (!updated) throw new NotFoundError("User not found");
    return toDetail(updated, storage);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Slug uniqueness collision — User.slug is the only @unique on this model
      // we touch here, so safe to attribute.
      throw new ConflictError("That slug is already taken — pick another");
    }
    throw err;
  }
}

export async function changeMyPassword(
  user: AuthenticatedUser,
  input: meSchemas.PasswordChangeInput,
): Promise<void> {
  const row = await getMe(user.id);
  if (!row) throw new NotFoundError("User not found");
  if (!row.passwordHash) {
    // OAuth-only user (no current password) — re-authenticate flow lives
    // elsewhere; surfaces the same 401 to avoid leaking the difference.
    throw new IncorrectPasswordError();
  }
  const ok = await verifyPassword(input.currentPassword, row.passwordHash);
  if (!ok) throw new IncorrectPasswordError();
  const newHash = await hashPassword(input.newPassword);
  await setPasswordHash(user.id, newHash);
}

export async function getMySettings(user: AuthenticatedUser): Promise<meSchemas.UserSettingsT> {
  const row = await getMe(user.id);
  if (!row) throw new NotFoundError("User not found");
  return toSettings(row.settings);
}

export async function updateMySettings(
  user: AuthenticatedUser,
  input: meSchemas.UserSettingsUpdateInput,
): Promise<meSchemas.UserSettingsT> {
  const patch: Prisma.UserSettingsUpdateInput = {};
  if (input.preferredLocale !== undefined) patch.preferredLocale = input.preferredLocale;
  if (input.notifyOnViewingRequest !== undefined)
    patch.notifyOnViewingRequest = input.notifyOnViewingRequest;
  if (input.notifyOnChatMessage !== undefined)
    patch.notifyOnChatMessage = input.notifyOnChatMessage;
  if (input.notifyOnLead !== undefined) patch.notifyOnLead = input.notifyOnLead;
  if (input.notifyOnDealEvent !== undefined) patch.notifyOnDealEvent = input.notifyOnDealEvent;
  if (input.notifyOnImportFailure !== undefined)
    patch.notifyOnImportFailure = input.notifyOnImportFailure;
  if (input.emailDigestFrequency !== undefined)
    patch.emailDigestFrequency = input.emailDigestFrequency;

  const settings = await upsertSettings(user.id, patch);
  return toSettings(settings);
}

// -------- DTO mappers --------

function toDetail(row: MeRow, storage: Storage): meSchemas.MeDetail {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    agencyId: row.agencyId,
    agencyName: row.agency?.name ?? null,
    agencySlug: row.agency?.slug ?? null,
    twoFactorEnabled: !!row.settings?.totpEnabledAt,
    profile: {
      firstName: row.firstName,
      lastName: row.lastName,
      slug: row.slug,
      photoR2Key: row.photoR2Key,
      photoPublicUrl: row.photoR2Key ? storage.publicUrl(row.photoR2Key) : null,
      phone: row.phone,
      whatsappNumber: row.whatsappNumber,
      bio: row.bio,
      languagesSpoken: row.languagesSpoken,
      publicProfileEnabled: row.publicProfileEnabled,
    },
    settings: toSettings(row.settings),
  };
}

function toSettings(
  row: NonNullable<MeRow["settings"]> | null | undefined,
): meSchemas.UserSettingsT {
  if (!row) return DEFAULT_SETTINGS;
  return {
    preferredLocale: row.preferredLocale as meSchemas.UserSettingsT["preferredLocale"],
    notifyOnViewingRequest: row.notifyOnViewingRequest,
    notifyOnChatMessage: row.notifyOnChatMessage,
    notifyOnLead: row.notifyOnLead,
    notifyOnDealEvent: row.notifyOnDealEvent,
    notifyOnImportFailure: row.notifyOnImportFailure,
    emailDigestFrequency:
      row.emailDigestFrequency as meSchemas.UserSettingsT["emailDigestFrequency"],
  };
}
