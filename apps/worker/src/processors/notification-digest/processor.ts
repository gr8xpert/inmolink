import { prisma } from "@inmolink/db";
import type { Notification, NotificationKind } from "@prisma/client";
import type { Job, Processor } from "bullmq";
import type pino from "pino";

/**
 * NOTIFICATION_DIGEST processor (PLAN §11.6 + §11.8 offline message queue).
 *
 * Hourly tick. For every user with at least one notification not yet
 * delivered by email, send one digest message respecting the user's
 * `UserSettings.emailDigestFrequency`:
 *   - INSTANT: send immediately (every tick), one digest per outstanding batch
 *   - DAILY:   send only if any pending notification is older than 24h
 *   - WEEKLY:  send only if any pending notification is older than 7d
 *
 * After a successful send the rows have `emailedAt = now`. Resend failure
 * leaves rows queued for retry on the next tick.
 *
 * Ships intentionally small — Sprint 8 will rebuild this around per-agency
 * SMTP, EmailTemplate, EmailSuppression. For now we use platform Resend.
 */

type Frequency = "INSTANT" | "DAILY" | "WEEKLY";

const HOUR_MS = 3600 * 1000;

function thresholdFor(freq: Frequency): number {
  if (freq === "DAILY") return 24 * HOUR_MS;
  if (freq === "WEEKLY") return 7 * 24 * HOUR_MS;
  return 0; // INSTANT
}

function subjectFor(count: number): string {
  return count === 1 ? "You have 1 new notification" : `You have ${count} new notifications`;
}

const KIND_LABELS: Record<NotificationKind, string> = {
  VIEWING_REQUESTED: "New viewing request",
  VIEWING_ACCEPTED: "Viewing accepted",
  VIEWING_DECLINED: "Viewing declined",
  VIEWING_RESCHEDULED: "Viewing rescheduled",
  VIEWING_CANCELLED: "Viewing cancelled",
  VIEWING_EXPIRING_SOON: "Viewing expired",
  VIEWING_OUTCOME_SET: "Viewing outcome recorded",
  DEAL_SUBMITTED: "Deal awaiting your confirmation",
  DEAL_CONFIRMED: "Deal confirmed",
  DEAL_DISPUTED: "Deal disputed",
  DEAL_DISPUTE_RESOLVED: "Dispute resolved",
  CHAT_MESSAGE: "New chat message",
  LEAD_RECEIVED: "New lead",
  IMPORT_FAILED: "Feed import failed",
};

function renderHtml(args: { firstName: string; rows: Notification[]; webBaseUrl: string }): string {
  const items = args.rows
    .map((n) => {
      const label = KIND_LABELS[n.kind] ?? n.kind;
      return `<li><strong>${label}</strong> &middot; <small>${n.createdAt.toISOString()}</small></li>`;
    })
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px">
<h2 style="margin:0 0 16px">Hi ${args.firstName},</h2>
<p>Here's a summary of activity in your Inmolink dashboard.</p>
<ul style="line-height:1.8">${items}</ul>
<p><a href="${args.webBaseUrl}/en/dashboard" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Open dashboard</a></p>
<hr style="margin:24px 0;border:0;border-top:1px solid #eee" />
<p style="color:#666;font-size:12px">You can change digest frequency in Settings → Preferences.</p>
</body></html>`;
}

function renderText(rows: Notification[]): string {
  return rows
    .map((n) => `- ${KIND_LABELS[n.kind] ?? n.kind} (${n.createdAt.toISOString()})`)
    .join("\n");
}

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  logger: pino.Logger;
}): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      opts.logger.warn({ status: res.status, message: body.message }, "digest email failed");
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    opts.logger.warn({ err }, "digest email threw");
    return { ok: false };
  }
}

export function makeNotificationDigestProcessor(opts: {
  logger: pino.Logger;
  resendApiKey: string | undefined;
  emailFrom: string;
  webBaseUrl: string;
}): Processor {
  const { logger, resendApiKey, emailFrom, webBaseUrl } = opts;
  return async (_job: Job) => {
    // Find users with at least one pending notification.
    const groups = await prisma.notification.groupBy({
      by: ["userId"],
      where: { emailedAt: null },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    if (groups.length === 0) return { sent: 0 };

    let sent = 0;
    let skipped = 0;
    for (const g of groups) {
      const user = await prisma.user.findUnique({
        where: { id: g.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          isActive: true,
          settings: { select: { emailDigestFrequency: true } },
        },
      });
      if (!user || !user.isActive) {
        // Pretend we sent — they'll never see it, no point retrying every tick.
        await prisma.notification.updateMany({
          where: { userId: g.userId, emailedAt: null },
          data: { emailedAt: new Date() },
        });
        continue;
      }
      const frequency = (user.settings?.emailDigestFrequency as Frequency | undefined) ?? "INSTANT";
      const ageMs = g._min.createdAt ? Date.now() - g._min.createdAt.getTime() : 0;
      if (ageMs < thresholdFor(frequency)) {
        skipped += 1;
        continue;
      }

      const rows = await prisma.notification.findMany({
        where: { userId: g.userId, emailedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      if (rows.length === 0) continue;

      const html = renderHtml({ firstName: user.firstName, rows, webBaseUrl });
      const text = renderText(rows);
      const subject = subjectFor(rows.length);

      let ok = true;
      if (resendApiKey) {
        const r = await sendResend({
          apiKey: resendApiKey,
          from: emailFrom,
          to: user.email,
          subject,
          html,
          text,
          logger,
        });
        ok = r.ok;
      } else {
        logger.info(
          { to: user.email, subject, body: text },
          "digest: RESEND_API_KEY unset — log only",
        );
      }

      if (ok) {
        await prisma.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { emailedAt: new Date() },
        });
        sent += rows.length;
      }
    }
    if (sent > 0 || skipped > 0) {
      logger.info({ sent, skipped, groups: groups.length }, "notification digest tick");
    }
    return { sent, skipped };
  };
}
