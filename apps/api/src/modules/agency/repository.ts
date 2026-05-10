import { prisma } from "@inmolink/db";
import type { Prisma } from "@prisma/client";

const agencySelect = {
  id: true,
  slug: true,
  name: true,
  countryCode: true,
  isPublic: true,
  isActive: true,
  email: true,
  phone: true,
  website: true,
  whatsappNumber: true,
  socialFacebook: true,
  socialInstagram: true,
  socialLinkedin: true,
  socialTwitter: true,
  logoR2Key: true,
  bannerR2Key: true,
  heroImageR2Key: true,
  translations: {
    select: {
      locale: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
    },
    orderBy: { locale: "asc" },
  },
  settings: {
    select: {
      defaultCommissionPct: true,
      defaultIntroducerSharePct: true,
      viewingResponseDays: true,
      dealConfirmationDays: true,
    },
  },
} satisfies Prisma.AgencySelect;

export type AgencyRow = Prisma.AgencyGetPayload<{ select: typeof agencySelect }>;

export async function getAgency(id: string): Promise<AgencyRow | null> {
  return prisma.agency.findUnique({ where: { id }, select: agencySelect });
}

export async function updateAgency(
  id: string,
  data: Prisma.AgencyUpdateInput,
): Promise<AgencyRow | null> {
  return prisma.agency.update({ where: { id }, data, select: agencySelect });
}

/** Replace translations wholesale; locale unique-per-agency. */
export async function replaceTranslations(
  agencyId: string,
  translations: Array<{
    locale: string;
    description: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
  }>,
): Promise<AgencyRow | null> {
  return prisma.$transaction(async (tx) => {
    await tx.agencyTranslation.deleteMany({ where: { agencyId } });
    if (translations.length > 0) {
      await tx.agencyTranslation.createMany({
        data: translations.map((t) => ({
          agencyId,
          locale: t.locale,
          description: t.description,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
        })),
      });
    }
    return tx.agency.findUnique({ where: { id: agencyId }, select: agencySelect });
  });
}

export async function upsertSettings(
  agencyId: string,
  patch: Prisma.AgencySettingsUpdateInput,
): Promise<AgencyRow["settings"]> {
  await prisma.agencySettings.upsert({
    where: { agencyId },
    create: { ...(patch as Prisma.AgencySettingsUncheckedCreateInput), agencyId },
    update: patch,
  });
  const row = await prisma.agencySettings.findUnique({
    where: { agencyId },
    select: {
      defaultCommissionPct: true,
      defaultIntroducerSharePct: true,
      viewingResponseDays: true,
      dealConfirmationDays: true,
    },
  });
  return row;
}
