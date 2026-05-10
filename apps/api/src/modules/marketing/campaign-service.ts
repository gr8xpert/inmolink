import { prisma } from "@inmolink/db";
import type { marketingSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import type { AuthenticatedUser } from "../../plugins/auth";
import {
  ForbiddenError,
  NotFoundError,
  decodeCursor,
  encodeCursor,
  resolveAgencyId,
} from "./service";

type CampaignRow = {
  id: string;
  templateId: string | null;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  recipientFilter: Prisma.JsonValue;
  recipientCount: number;
  scheduledFor: Date | null;
  status: marketingSchemas.CampaignStatus;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function toCampaign(r: CampaignRow): marketingSchemas.Campaign {
  return {
    id: r.id,
    templateId: r.templateId,
    name: r.name,
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    recipientFilter: r.recipientFilter ?? null,
    recipientCount: r.recipientCount,
    scheduledFor: r.scheduledFor?.toISOString() ?? null,
    status: r.status,
    sentCount: r.sentCount,
    deliveredCount: r.deliveredCount,
    openedCount: r.openedCount,
    clickedCount: r.clickedCount,
    bouncedCount: r.bouncedCount,
    unsubscribedCount: r.unsubscribedCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export async function listCampaigns(
  user: AuthenticatedUser,
  query: { cursor?: string; limit?: number; status?: marketingSchemas.CampaignStatus },
  queryAgencyId: string | undefined,
) {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const decoded = decodeCursor(query.cursor);

  const where: Prisma.EmailCampaignWhereInput = { agencyId };
  if (query.status) where.status = query.status;
  if (decoded) {
    where.OR = [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
    ];
  }

  const rows = await prisma.emailCampaign.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  return {
    items: slice.map((r) => toCampaign(r as CampaignRow)),
    nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null,
  };
}

export async function getCampaign(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailCampaign.findFirst({ where: { id, agencyId } });
  if (!r) throw new NotFoundError("Campaign not found");
  return toCampaign(r as CampaignRow);
}

export async function createCampaign(
  user: AuthenticatedUser,
  input: marketingSchemas.CampaignInput,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.emailCampaign.create({
    data: {
      agencyId,
      templateId: input.templateId ?? null,
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText ?? null,
      recipientFilter: (input.recipientFilter ?? null) as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
  return toCampaign(r as CampaignRow);
}

export async function updateCampaign(
  user: AuthenticatedUser,
  id: string,
  input: marketingSchemas.CampaignInput,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const existing = await prisma.emailCampaign.findFirst({
    where: { id, agencyId },
    select: { status: true },
  });
  if (!existing) throw new NotFoundError("Campaign not found");
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new ForbiddenError("Only DRAFT or SCHEDULED campaigns can be edited");
  }
  await prisma.emailCampaign.update({
    where: { id },
    data: {
      templateId: input.templateId ?? null,
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText ?? null,
      recipientFilter: (input.recipientFilter ?? null) as Prisma.InputJsonValue,
    },
  });
  return getCampaign(user, id, queryAgencyId);
}

export async function deleteCampaign(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const existing = await prisma.emailCampaign.findFirst({
    where: { id, agencyId },
    select: { status: true },
  });
  if (!existing) throw new NotFoundError("Campaign not found");
  if (existing.status === "SENDING") {
    throw new ForbiddenError("Cannot delete a campaign that is currently sending");
  }
  await prisma.emailCampaign.delete({ where: { id } });
}

/**
 * Materialize EmailCampaignRecipient rows from the campaign's recipientFilter
 * + the agency's Contact / Lead pool. Returns the count materialized. Idempotent
 * (ignores P2002 dups thanks to the unique constraint on (campaignId, email)).
 */
async function materializeRecipients(
  campaignId: string,
  agencyId: string,
  filter: marketingSchemas.RecipientFilter | null,
): Promise<number> {
  const contacts = await loadAudience(agencyId, filter);

  if (contacts.length === 0) return 0;

  // EmailSuppression hard-blocks at send time, but we can pre-filter the
  // materialized set so the dashboard counts match what'll actually go out.
  const suppressed = await prisma.emailSuppression.findMany({
    where: { agencyId, email: { in: contacts.map((c) => c.email) } },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

  const eligible = contacts.filter((c) => !suppressedSet.has(c.email.toLowerCase()));

  // createMany skipDuplicates handles the unique (campaignId, email) constraint.
  const result = await prisma.emailCampaignRecipient.createMany({
    data: eligible.map((c) => ({
      campaignId,
      email: c.email,
      name: c.name,
      contactId: c.contactId ?? null,
      leadId: c.leadId ?? null,
      status: "QUEUED" as const,
      context: c.context as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

type AudienceRow = {
  email: string;
  name: string | null;
  contactId: string | null;
  leadId: string | null;
  context: Record<string, unknown>;
};

async function loadAudience(
  agencyId: string,
  filter: marketingSchemas.RecipientFilter | null,
): Promise<AudienceRow[]> {
  const source = filter?.source ?? "contacts";

  if (source === "contacts") {
    const where: Prisma.ContactWhereInput = { agencyId, unsubscribedAt: null };
    if (filter?.tags && filter.tags.length > 0) where.tags = { hasSome: filter.tags };
    const rows = await prisma.contact.findMany({
      where,
      select: { id: true, email: true, firstName: true, lastName: true },
      take: 5_000,
    });
    return rows.map((c) => ({
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
      contactId: c.id,
      leadId: null,
      context: { firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email },
    }));
  }

  // source === "leads" — Lead.email is nullable; we drop null-email leads
  // since campaigns can't reach them. Phone-only leads are out of scope
  // for email marketing by definition.
  const where: Prisma.LeadWhereInput = { agencyId, email: { not: null } };
  if (filter?.propertyId) where.propertyId = filter.propertyId;
  const rows = await prisma.lead.findMany({
    where,
    select: { id: true, email: true, name: true, propertyId: true },
    take: 5_000,
  });
  return rows
    .filter((l): l is typeof l & { email: string } => Boolean(l.email))
    .map((l) => ({
      email: l.email,
      name: l.name,
      contactId: null,
      leadId: l.id,
      context: { firstName: l.name ?? "", email: l.email, propertyId: l.propertyId ?? "" },
    }));
}

export async function sendCampaignNow(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
  emailQueue: Queue,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const c = await prisma.emailCampaign.findFirst({ where: { id, agencyId } });
  if (!c) throw new NotFoundError("Campaign not found");
  if (c.status !== "DRAFT" && c.status !== "SCHEDULED" && c.status !== "PAUSED") {
    throw new ForbiddenError(`Cannot send a campaign in status ${c.status}`);
  }

  // Require an AgencyEmailConfig — without SMTP we can't actually deliver.
  const cfg = await prisma.agencyEmailConfig.findUnique({
    where: { agencyId },
    select: { id: true },
  });
  if (!cfg) throw new ForbiddenError("Configure SMTP before sending campaigns");

  const filter = (c.recipientFilter as marketingSchemas.RecipientFilter | null) ?? null;
  const materialized = await materializeRecipients(c.id, agencyId, filter);

  const total = await prisma.emailCampaignRecipient.count({ where: { campaignId: c.id } });

  await prisma.emailCampaign.update({
    where: { id: c.id },
    data: {
      status: total > 0 ? "SENDING" : "FAILED",
      recipientCount: total,
      startedAt: new Date(),
    },
  });

  if (materialized > 0 || total > 0) {
    // Enqueue per-recipient send jobs. The processor is responsible for the
    // actual SMTP transport (per-agency creds), suppression check, link
    // rewrites, tracking pixel, and counter increments.
    const queued = await prisma.emailCampaignRecipient.findMany({
      where: { campaignId: c.id, status: "QUEUED" },
      select: { id: true },
    });
    for (const r of queued) {
      await emailQueue.add(
        "campaign-recipient",
        { recipientId: r.id, kind: "campaign" },
        {
          jobId: `email-recipient:${r.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      );
    }
  }

  return getCampaign(user, id, queryAgencyId);
}

export async function scheduleCampaign(
  user: AuthenticatedUser,
  id: string,
  scheduledFor: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const c = await prisma.emailCampaign.findFirst({ where: { id, agencyId } });
  if (!c) throw new NotFoundError("Campaign not found");
  if (c.status !== "DRAFT" && c.status !== "SCHEDULED") {
    throw new ForbiddenError(`Cannot schedule a campaign in status ${c.status}`);
  }
  const dt = new Date(scheduledFor);
  if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now() - 60_000) {
    throw new ForbiddenError("scheduledFor must be a future timestamp");
  }
  await prisma.emailCampaign.update({
    where: { id: c.id },
    data: { scheduledFor: dt, status: "SCHEDULED" },
  });
  return getCampaign(user, id, queryAgencyId);
}

export async function cancelCampaign(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.Campaign> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const c = await prisma.emailCampaign.findFirst({ where: { id, agencyId } });
  if (!c) throw new NotFoundError("Campaign not found");
  if (c.status === "SENT" || c.status === "CANCELLED") {
    throw new ForbiddenError(`Cannot cancel a campaign in status ${c.status}`);
  }
  await prisma.emailCampaign.update({
    where: { id: c.id },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  return getCampaign(user, id, queryAgencyId);
}
