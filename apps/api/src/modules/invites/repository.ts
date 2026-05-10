import { prisma } from "@inmolink/db";
import type { Prisma } from "@prisma/client";

const inviteSelect = {
  id: true,
  agencyId: true,
  email: true,
  invitedRole: true,
  invitedById: true,
  token: true,
  expiresAt: true,
  acceptedAt: true,
  acceptedById: true,
  createdAt: true,
  agency: { select: { id: true, name: true, slug: true, logoR2Key: true } },
} satisfies Prisma.AgencyInviteSelect;

export type InviteRow = Prisma.AgencyInviteGetPayload<{ select: typeof inviteSelect }>;

export async function listPendingInvites(agencyId: string): Promise<InviteRow[]> {
  return prisma.agencyInvite.findMany({
    where: { agencyId, acceptedAt: null },
    select: inviteSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function listAgencyMembers(agencyId: string) {
  return prisma.user.findMany({
    where: { agencyId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      photoR2Key: true,
    },
    orderBy: [{ role: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function findInviteByToken(token: string): Promise<InviteRow | null> {
  return prisma.agencyInvite.findUnique({ where: { token }, select: inviteSelect });
}

export async function findInviteById(id: string): Promise<InviteRow | null> {
  return prisma.agencyInvite.findUnique({ where: { id }, select: inviteSelect });
}

export async function findActivePendingInviteForEmail(
  agencyId: string,
  email: string,
): Promise<InviteRow | null> {
  return prisma.agencyInvite.findFirst({
    where: { agencyId, email: { equals: email, mode: "insensitive" }, acceptedAt: null },
    select: inviteSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function createInvite(data: {
  agencyId: string;
  email: string;
  invitedRole: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
  invitedById: string;
  token: string;
  expiresAt: Date;
}): Promise<InviteRow> {
  return prisma.agencyInvite.create({
    data: {
      agencyId: data.agencyId,
      email: data.email,
      invitedRole: data.invitedRole,
      invitedById: data.invitedById,
      token: data.token,
      expiresAt: data.expiresAt,
    },
    select: inviteSelect,
  });
}

export async function bumpInvite(
  id: string,
  data: { token: string; expiresAt: Date },
): Promise<InviteRow> {
  return prisma.agencyInvite.update({
    where: { id },
    data: { token: data.token, expiresAt: data.expiresAt },
    select: inviteSelect,
  });
}

export async function deleteInvite(id: string): Promise<void> {
  await prisma.agencyInvite.delete({ where: { id } });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, agencyId: true, isActive: true },
  });
}

export async function attachExistingUserToAgency(args: {
  userId: string;
  agencyId: string;
  role: "AGENCY_ADMIN" | "AGENT" | "SUPER_ADMIN";
  inviteId: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: args.userId },
      data: { agencyId: args.agencyId, role: args.role },
    }),
    prisma.agencyInvite.update({
      where: { id: args.inviteId },
      data: { acceptedAt: new Date(), acceptedById: args.userId },
    }),
  ]);
}

export async function createUserFromInvite(args: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  slug: string;
  agencyId: string;
  role: "AGENCY_ADMIN" | "AGENT" | "SUPER_ADMIN";
  inviteId: string;
}): Promise<{ id: string }> {
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: args.email,
        passwordHash: args.passwordHash,
        firstName: args.firstName,
        lastName: args.lastName,
        slug: args.slug,
        agencyId: args.agencyId,
        role: args.role,
        emailVerifiedAt: new Date(), // invite link == ownership proof
      },
      select: { id: true },
    });
    await tx.agencyInvite.update({
      where: { id: args.inviteId },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });
    return user;
  });
  return created;
}
