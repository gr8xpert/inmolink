import { verifyTrackingToken } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const PIXEL = Buffer.from(
  // 1×1 transparent GIF
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

type TrackingOpts = {
  hmacSecretHex: string;
  publicBaseUrl: string;
};

/**
 * Anonymous email-tracking surface.
 *
 * - Open: `GET /o/:tok` returns a 1×1 GIF, idempotently stamps `openedAt`
 *   on the recipient and increments `EmailCampaign.openedCount`.
 * - Click: `GET /c/:tok?u=<url>` 302s to the original URL after stamping.
 * - Unsubscribe: `GET /u/:tok` shows a confirmation page; `POST /u/:tok`
 *   writes EmailSuppression(UNSUBSCRIBE) and stamps the recipient.
 *
 * Tokens are HMAC-signed (see @inmolink/auth/tokens). Verification fails
 * silently to keep these endpoints opaque to crawlers.
 */
export async function emailTrackingRoutes(app: FastifyInstance, opts: TrackingOpts): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/o/:tok",
    { schema: { tags: ["email-tracking"], params: z.object({ tok: z.string().min(1) }) } },
    async (request, reply) => {
      const payload = verifyTrackingToken(request.params.tok, opts.hmacSecretHex);
      if (payload?.k === "open") {
        await stampOpen(payload.r).catch(() => undefined);
      }
      return reply
        .header("content-type", "image/gif")
        .header("cache-control", "no-store, must-revalidate")
        .header("pragma", "no-cache")
        .send(PIXEL);
    },
  );

  fastify.get(
    "/c/:tok",
    {
      schema: {
        tags: ["email-tracking"],
        params: z.object({ tok: z.string().min(1) }),
        querystring: z.object({ u: z.string().url() }),
      },
    },
    async (request, reply) => {
      const payload = verifyTrackingToken(request.params.tok, opts.hmacSecretHex);
      if (payload?.k === "click") {
        await stampClick(payload.r).catch(() => undefined);
      }
      return reply.redirect(request.query.u, 302);
    },
  );

  fastify.get(
    "/u/:tok",
    { schema: { tags: ["email-tracking"], params: z.object({ tok: z.string().min(1) }) } },
    async (request, reply) => {
      const payload = verifyTrackingToken(request.params.tok, opts.hmacSecretHex);
      if (!payload || payload.k !== "unsubscribe") {
        return reply.code(404).type("text/html").send(notFoundHtml());
      }
      return reply.type("text/html").send(unsubscribeHtml(request.params.tok));
    },
  );

  fastify.post(
    "/u/:tok",
    { schema: { tags: ["email-tracking"], params: z.object({ tok: z.string().min(1) }) } },
    async (request, reply) => {
      const payload = verifyTrackingToken(request.params.tok, opts.hmacSecretHex);
      if (!payload || payload.k !== "unsubscribe") {
        return reply.code(404).type("text/html").send(notFoundHtml());
      }
      await unsubscribeRecipient(payload.r).catch(() => undefined);
      return reply.type("text/html").send(unsubscribedHtml());
    },
  );
}

async function stampOpen(recipientId: string): Promise<void> {
  // Conditional update so we only bump the campaign's openedCount the first
  // time a recipient opens (avoids inflating from rendering retries).
  const updated = await prisma.emailCampaignRecipient.updateMany({
    where: { id: recipientId, openedAt: null },
    data: { openedAt: new Date(), status: "OPENED" },
  });
  if (updated.count > 0) {
    const r = await prisma.emailCampaignRecipient.findUnique({
      where: { id: recipientId },
      select: { campaignId: true },
    });
    if (r) {
      await prisma.emailCampaign.update({
        where: { id: r.campaignId },
        data: { openedCount: { increment: 1 } },
      });
    }
  }
}

async function stampClick(recipientId: string): Promise<void> {
  const updated = await prisma.emailCampaignRecipient.updateMany({
    where: { id: recipientId, clickedAt: null },
    data: { clickedAt: new Date(), status: "CLICKED" },
  });
  if (updated.count > 0) {
    const r = await prisma.emailCampaignRecipient.findUnique({
      where: { id: recipientId },
      select: { campaignId: true },
    });
    if (r) {
      await prisma.emailCampaign.update({
        where: { id: r.campaignId },
        data: { clickedCount: { increment: 1 } },
      });
    }
  }
}

async function unsubscribeRecipient(recipientId: string): Promise<void> {
  const r = await prisma.emailCampaignRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      email: true,
      contactId: true,
      campaignId: true,
      unsubscribedAt: true,
      campaign: { select: { agencyId: true } },
    },
  });
  if (!r) return;
  // EmailSuppression unique on (agencyId, email) — collapse dups.
  await prisma.$transaction(async (tx) => {
    if (!r.unsubscribedAt) {
      await tx.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { unsubscribedAt: new Date(), status: "UNSUBSCRIBED" },
      });
      await tx.emailCampaign.update({
        where: { id: r.campaignId },
        data: { unsubscribedCount: { increment: 1 } },
      });
    }
    await tx.emailSuppression.upsert({
      where: { agencyId_email: { agencyId: r.campaign.agencyId, email: r.email } },
      create: { agencyId: r.campaign.agencyId, email: r.email, reason: "UNSUBSCRIBE" },
      update: {},
    });
    if (r.contactId) {
      await tx.contact.update({
        where: { id: r.contactId },
        data: { unsubscribedAt: new Date() },
      });
    }
  });
}

function notFoundHtml(): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem">
  <h1>Link not found</h1>
  <p>This unsubscribe link is no longer valid.</p>
  </body></html>`;
}

function unsubscribeHtml(token: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem;max-width:480px;margin:auto">
  <h1>Unsubscribe</h1>
  <p>Click the button to stop receiving marketing emails for this address.</p>
  <form method="post" action="/api/email/u/${encodeURIComponent(token)}">
    <button type="submit" style="background:#000;color:#fff;border:0;padding:10px 20px;font-size:14px;cursor:pointer;border-radius:6px">Unsubscribe me</button>
  </form>
  </body></html>`;
}

function unsubscribedHtml(): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem">
  <h1>You're unsubscribed</h1>
  <p>You won't receive marketing emails from this agency at this address. If this was a mistake, contact the agency directly.</p>
  </body></html>`;
}
