import { decryptFromString, signTrackingToken } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import { marketingSchemas } from "@inmolink/shared";
import type { Job, Processor } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";
import type pino from "pino";

/**
 * EMAIL_SEND processor (PLAN §11.8 marketing).
 *
 * One job = one EmailCampaignRecipient. Steps:
 *   1. Load recipient + parent campaign + agency email config.
 *   2. Skip if EmailSuppression hit (agencyId, email).
 *   3. Render merge tags into subject + body using snapshotted recipient
 *      context (taken at materialize time so edits to Contact don't drift
 *      already-sent emails).
 *   4. Rewrite anchor hrefs through the click-tracking redirect.
 *   5. Inject 1×1 open-pixel + List-Unsubscribe header.
 *   6. Send via per-agency nodemailer transport (with optional DKIM).
 *   7. Stamp recipient + bump campaign counters; on transport failure mark
 *      FAILED so BullMQ retries the job (3 attempts, exponential backoff).
 *   8. When the last queued recipient finishes, flip campaign → SENT.
 */

type Args = {
  encryptionKey: string;
  trackingSecret: string;
  webBaseUrl: string;
  apiBaseUrl: string;
  logger: pino.Logger;
};

/**
 * Per-worker SMTP transport pool (#017). Hoisted to module scope so the
 * shutdown handler in worker.ts can call {@link closeEmailTransports} to
 * drain SMTP sockets cleanly on SIGTERM.
 *
 * Bounded LRU via insertion-order Map: when size reaches MAX, the oldest
 * entry is closed + evicted before inserting the new one. Stale-config
 * eviction (key rotation, DKIM rotation) is currently bounded by worker
 * restart cadence + this LRU; tighter eviction (Redis pub-sub on PATCH or
 * keying by `updatedAt`) is a v1.5 follow-up.
 */
const TRANSPORTER_CACHE_MAX = 200;
const transporterCache = new Map<string, Transporter>();

function evictOldestTransporter(): void {
  const first = transporterCache.keys().next();
  if (first.done) return;
  const key = first.value;
  const t = transporterCache.get(key);
  transporterCache.delete(key);
  try {
    t?.close();
  } catch {
    // Ignore — best-effort cleanup
  }
}

export function closeEmailTransports(): void {
  for (const [key, t] of transporterCache) {
    try {
      t.close();
    } catch {
      // Best-effort — server may already have dropped the socket
    }
    transporterCache.delete(key);
  }
}

type Recipient = {
  id: string;
  campaignId: string;
  email: string;
  name: string | null;
  context: Record<string, unknown> | null;
  status: string;
};

type Campaign = {
  id: string;
  agencyId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  status: string;
  agency: { name: string };
};

type EmailCfg = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPasswordEnc: string;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
  dkimDomain: string | null;
  dkimSelector: string | null;
  dkimPrivateKeyEnc: string | null;
};

const TAG_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9._]*)\s*\}\}/g;

export function makeEmailSendProcessor(opts: Args): Processor {
  return async function emailSendProcessor(job: Job): Promise<void> {
    const data = marketingSchemas.emailSendJobSchema.parse(job.data);
    const recipient = (await prisma.emailCampaignRecipient.findUnique({
      where: { id: data.recipientId },
      select: { id: true, campaignId: true, email: true, name: true, context: true, status: true },
    })) as Recipient | null;
    if (!recipient) {
      opts.logger.warn({ recipientId: data.recipientId }, "EMAIL_SEND: recipient not found");
      return;
    }
    if (recipient.status !== "QUEUED") {
      opts.logger.info(
        { recipientId: recipient.id, status: recipient.status },
        "EMAIL_SEND: skipping non-queued recipient",
      );
      return;
    }

    const campaign = (await prisma.emailCampaign.findUnique({
      where: { id: recipient.campaignId },
      select: {
        id: true,
        agencyId: true,
        subject: true,
        bodyHtml: true,
        bodyText: true,
        status: true,
        agency: { select: { name: true } },
      },
    })) as Campaign | null;
    if (!campaign) {
      await markRecipientFailed(recipient.id, "Campaign not found");
      return;
    }
    if (campaign.status === "CANCELLED" || campaign.status === "PAUSED") {
      opts.logger.info({ campaignId: campaign.id }, "EMAIL_SEND: campaign no longer active");
      return;
    }

    // Suppression check (case-insensitive via Citext column).
    const suppressed = await prisma.emailSuppression.findFirst({
      where: { agencyId: campaign.agencyId, email: recipient.email },
      select: { id: true },
    });
    if (suppressed) {
      await prisma.$transaction([
        prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED", errorMessage: "Suppressed", sentAt: new Date() },
        }),
        prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { unsubscribedCount: { increment: 1 } },
        }),
      ]);
      await maybeFinalizeCampaign(campaign.id);
      return;
    }

    // Build merge context for this recipient (sender-side render so the
    // SMTP relay never sees `{{}}` tags).
    const ctx = recipient.context ?? {};
    const unsubscribeUrl = `${opts.apiBaseUrl}/api/email/u/${signTrackingToken(
      { k: "unsubscribe", r: recipient.id },
      opts.trackingSecret,
    )}`;
    const trackingPixelUrl = `${opts.apiBaseUrl}/api/email/o/${signTrackingToken(
      { k: "open", r: recipient.id },
      opts.trackingSecret,
    )}`;
    const mergeCtx: Record<string, unknown> = {
      ...ctx,
      contact: {
        email: recipient.email,
        firstName: (ctx as Record<string, unknown>).firstName ?? "",
        lastName: (ctx as Record<string, unknown>).lastName ?? "",
        ...((ctx as Record<string, unknown>).contact as Record<string, unknown> | undefined),
      },
      agency: { name: campaign.agency.name },
      unsubscribeUrl,
      trackingPixelUrl,
    };
    const renderedSubject = renderMergeTags(campaign.subject, mergeCtx, "text");
    let renderedHtml = renderMergeTags(campaign.bodyHtml, mergeCtx, "html");
    const renderedText = campaign.bodyText
      ? renderMergeTags(campaign.bodyText, mergeCtx, "text")
      : undefined;

    // Rewrite href links + append 1×1 pixel.
    renderedHtml = rewriteClickLinks(
      renderedHtml,
      recipient.id,
      opts.trackingSecret,
      opts.apiBaseUrl,
    );
    renderedHtml = `${renderedHtml}\n<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none" />`;

    // Per-agency SMTP transport.
    const cfg = (await prisma.agencyEmailConfig.findUnique({
      where: { agencyId: campaign.agencyId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPasswordEnc: true,
        smtpSecure: true,
        fromEmail: true,
        fromName: true,
        dkimDomain: true,
        dkimSelector: true,
        dkimPrivateKeyEnc: true,
        id: true,
      },
    })) as (EmailCfg & { id: string }) | null;
    if (!cfg) {
      await markRecipientFailed(recipient.id, "Agency SMTP not configured");
      await maybeFinalizeCampaign(campaign.id);
      return;
    }

    let transport = transporterCache.get(cfg.id);
    if (transport) {
      // Touch LRU position so freshly-used entries don't get evicted.
      transporterCache.delete(cfg.id);
      transporterCache.set(cfg.id, transport);
    } else {
      if (transporterCache.size >= TRANSPORTER_CACHE_MAX) evictOldestTransporter();
      transport = createTransport(cfg, opts.encryptionKey);
      transporterCache.set(cfg.id, transport);
    }

    try {
      const info = await transport.sendMail({
        from: `"${cfg.fromName.replace(/"/g, "'")}" <${cfg.fromEmail}>`,
        to: recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        list: {
          unsubscribe: [{ url: unsubscribeUrl, comment: "Unsubscribe" }],
        },
      });
      opts.logger.info(
        { messageId: info.messageId, to: recipient.email, campaignId: campaign.id },
        "Campaign email sent",
      );
      await prisma.$transaction([
        prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", sentAt: new Date() },
        }),
        prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { sentCount: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      opts.logger.error({ err: message, recipientId: recipient.id }, "Campaign email failed");
      // Throw so BullMQ retries; mark FAILED only on the final attempt
      // (handled in worker.ts via the `failed` event listener).
      throw err;
    }

    await maybeFinalizeCampaign(campaign.id);
  };
}

function createTransport(cfg: EmailCfg & { id: string }, encryptionKeyHex: string): Transporter {
  const key = Buffer.from(encryptionKeyHex, "hex");
  const password = decryptFromString(cfg.smtpPasswordEnc, key);
  const dkimPrivateKey = cfg.dkimPrivateKeyEnc
    ? decryptFromString(cfg.dkimPrivateKeyEnc, key)
    : null;
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure || cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: password },
    pool: true,
    maxConnections: 5,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
    ...(cfg.dkimDomain && cfg.dkimSelector && dkimPrivateKey
      ? {
          dkim: {
            domainName: cfg.dkimDomain,
            keySelector: cfg.dkimSelector,
            privateKey: dkimPrivateKey,
          },
        }
      : {}),
  });
}

async function markRecipientFailed(id: string, reason: string): Promise<void> {
  await prisma.emailCampaignRecipient.update({
    where: { id },
    data: { status: "FAILED", errorMessage: reason, sentAt: new Date() },
  });
}

/**
 * If no QUEUED recipients remain on the campaign, flip status to SENT.
 * Idempotent — only writes when the row is still SENDING.
 */
async function maybeFinalizeCampaign(campaignId: string): Promise<void> {
  const remaining = await prisma.emailCampaignRecipient.count({
    where: { campaignId, status: "QUEUED" },
  });
  if (remaining > 0) return;
  await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: { status: "SENT", finishedAt: new Date() },
  });
}

function renderMergeTags(
  template: string,
  ctx: Record<string, unknown>,
  mode: "html" | "text",
): string {
  return template.replace(TAG_RE, (_, path: string) => {
    const v = lookup(ctx, path);
    return mode === "html" ? escapeHtml(v) : v;
  });
}

function lookup(ctx: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rewrite all <a href="..."> attributes through the click-tracking redirect
 * so we can stamp clickedAt without third-party trackers. Skips anchors,
 * data: URIs, mailto:, and the unsubscribe link itself (already pointing
 * at a tracked endpoint).
 */
function rewriteClickLinks(
  html: string,
  recipientId: string,
  secret: string,
  apiBaseUrl: string,
): string {
  return html.replace(/href="([^"]+)"/g, (match, url: string) => {
    if (
      url.startsWith("#") ||
      url.startsWith("mailto:") ||
      url.startsWith("data:") ||
      url.startsWith(`${apiBaseUrl}/api/email/`)
    ) {
      return match;
    }
    // Bind the destination URL into the HMAC payload so /c/:tok can't be
    // weaponised as an open redirect (#015).
    const tok = signTrackingToken({ k: "click", r: recipientId, u: url }, secret);
    const wrapped = `${apiBaseUrl}/api/email/c/${tok}`;
    return `href="${wrapped}"`;
  });
}
