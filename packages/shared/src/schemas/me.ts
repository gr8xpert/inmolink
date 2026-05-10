import { z } from "zod";
import { localeSchema } from "../locales";

/**
 * Wire-format schemas for the signed-in user's own profile + password +
 * preferences (Sprint 4.A). Never used to read other users — that flows
 * through the public /agent/[slug] surface or the admin user-management
 * surface (deferred).
 *
 * Slug uniqueness is checked server-side (P2002 → 409); the regex here
 * just enforces the URL-safe shape.
 */

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const profileSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  slug: z.string().min(2).max(80).regex(SLUG_REGEX, "lowercase alphanumeric with dashes only"),
  photoR2Key: z.string().min(1).max(255).nullable().optional(),
  phone: z.string().min(1).max(40).nullable().optional(),
  whatsappNumber: z.string().min(1).max(40).nullable().optional(),
  bio: z.string().max(4_000).nullable().optional(),
  languagesSpoken: z.array(z.string().length(2)).max(20).default([]),
  publicProfileEnabled: z.boolean(),
});

export const profileUpdateSchema = profileSchema.partial();

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(12).max(200),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export const emailDigestFrequencySchema = z.enum(["INSTANT", "DAILY", "WEEKLY"]);

export const userSettingsSchema = z.object({
  preferredLocale: localeSchema,
  notifyOnViewingRequest: z.boolean(),
  notifyOnChatMessage: z.boolean(),
  notifyOnLead: z.boolean(),
  notifyOnDealEvent: z.boolean(),
  notifyOnImportFailure: z.boolean(),
  emailDigestFrequency: emailDigestFrequencySchema,
});

export const userSettingsUpdateSchema = userSettingsSchema.partial();

export const meDetailSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "AGENCY_ADMIN", "AGENT"]),
  agencyId: z.string().nullable(),
  agencyName: z.string().nullable(),
  agencySlug: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    slug: z.string(),
    photoR2Key: z.string().nullable(),
    photoPublicUrl: z.string().nullable(),
    phone: z.string().nullable(),
    whatsappNumber: z.string().nullable(),
    bio: z.string().nullable(),
    languagesSpoken: z.array(z.string()),
    publicProfileEnabled: z.boolean(),
  }),
  settings: userSettingsSchema,
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type UserSettingsT = z.infer<typeof userSettingsSchema>;
export type UserSettingsUpdateInput = z.infer<typeof userSettingsUpdateSchema>;
export type MeDetail = z.infer<typeof meDetailSchema>;
