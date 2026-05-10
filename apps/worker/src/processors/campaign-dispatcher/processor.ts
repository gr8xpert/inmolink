import { prisma } from "@inmolink/db";
import type { Job, Processor, Queue } from "bullmq";
import type pino from "pino";

/**
 * CAMPAIGN_DISPATCHER (PLAN §11.8). Ticks every 5 min. Finds SCHEDULED
 * campaigns whose `scheduledFor` has elapsed, materializes recipients,
 * flips status to SENDING, and enqueues per-recipient EMAIL_SEND jobs.
 *
 * Idempotent: a single transition uses `updateMany(where: { status: SCHEDULED })`
 * so a second concurrent tick won't re-enqueue. Materialization uses
 * `createMany skipDuplicates` against the unique (campaignId, email) index.
 */

type Args = {
  emailQueue: Queue;
  logger: pino.Logger;
};

type AudienceRow = {
  email: string;
  name: string | null;
  contactId: string | null;
  leadId: string | null;
  context: Record<string, unknown>;
};

export function makeCampaignDispatcherProcessor(opts: Args): Processor {
  return async function dispatcher(_job: Job): Promise<void> {
    const due = await prisma.emailCampaign.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: { lte: new Date() },
      },
      take: 50,
      select: { id: true, agencyId: true, recipientFilter: true },
    });

    for (const c of due) {
      try {
        const filter =
          (c.recipientFilter as {
            source?: "contacts" | "leads";
            tags?: string[];
            propertyId?: string;
          } | null) ?? null;
        const audience = await loadAudience(c.agencyId, filter);
        const suppressed = audience.length
          ? new Set(
              (
                await prisma.emailSuppression.findMany({
                  where: { agencyId: c.agencyId, email: { in: audience.map((a) => a.email) } },
                  select: { email: true },
                })
              ).map((s) => s.email.toLowerCase()),
            )
          : new Set<string>();
        const eligible = audience.filter((a) => !suppressed.has(a.email.toLowerCase()));

        if (eligible.length > 0) {
          await prisma.emailCampaignRecipient.createMany({
            data: eligible.map((r) => ({
              campaignId: c.id,
              email: r.email,
              name: r.name,
              contactId: r.contactId,
              leadId: r.leadId,
              status: "QUEUED",
              context: r.context as never,
            })),
            skipDuplicates: true,
          });
        }

        const total = await prisma.emailCampaignRecipient.count({ where: { campaignId: c.id } });

        // Race-safe transition. If another dispatcher tick already moved
        // the row out of SCHEDULED, this updateMany returns count=0 and we
        // skip the enqueue step.
        const transitioned = await prisma.emailCampaign.updateMany({
          where: { id: c.id, status: "SCHEDULED" },
          data: {
            status: total > 0 ? "SENDING" : "FAILED",
            recipientCount: total,
            startedAt: new Date(),
          },
        });
        if (transitioned.count === 0) continue;

        if (total > 0) {
          const queued = await prisma.emailCampaignRecipient.findMany({
            where: { campaignId: c.id, status: "QUEUED" },
            select: { id: true },
          });
          for (const r of queued) {
            await opts.emailQueue.add(
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
        opts.logger.info(
          { campaignId: c.id, total, eligible: eligible.length },
          "Campaign dispatched",
        );
      } catch (err) {
        opts.logger.error({ err, campaignId: c.id }, "Campaign dispatch failed");
      }
    }
  };
}

async function loadAudience(
  agencyId: string,
  filter: { source?: "contacts" | "leads"; tags?: string[]; propertyId?: string } | null,
): Promise<AudienceRow[]> {
  const source = filter?.source ?? "contacts";
  if (source === "contacts") {
    const where: { agencyId: string; unsubscribedAt: null; tags?: { hasSome: string[] } } = {
      agencyId,
      unsubscribedAt: null,
    };
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
  // source === "leads" — drop null-email leads.
  const where: { agencyId: string; email: { not: null }; propertyId?: string } = {
    agencyId,
    email: { not: null },
  };
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
