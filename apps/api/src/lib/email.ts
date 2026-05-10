import type { FastifyBaseLogger } from "fastify";

/**
 * Minimal Resend-via-fetch wrapper. We don't pull in the `resend` SDK yet
 * because Sprint 8 (marketing) will rebuild this around BullMQ + per-agency
 * SMTP / templates / suppressions — anything we ship now is throwaway.
 *
 * Behaviour:
 *   - When RESEND_API_KEY is set, POSTs to https://api.resend.com/emails.
 *   - When unset (dev / test), returns ok=true and logs the body so the
 *     developer can copy the link out of the api log instead of needing a
 *     real Resend account to test invite flow.
 *   - Never throws to the caller — surfaces errors via the returned shape
 *     so the invite endpoint can choose to soft-fail vs hard-fail.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailEnv = {
  RESEND_API_KEY: string | undefined;
  EMAIL_FROM: string;
};

export async function sendEmail(
  env: EmailEnv,
  input: SendEmailInput,
  log: FastifyBaseLogger,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  if (!env.RESEND_API_KEY) {
    log.info(
      { to: input.to, subject: input.subject, body: input.text },
      "email: RESEND_API_KEY unset — logging only",
    );
    return { ok: true, id: null, error: null };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      log.warn({ to: input.to, status: res.status, message: body.message }, "email: send failed");
      return { ok: false, id: null, error: body.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: body.id ?? null, error: null };
  } catch (err) {
    log.warn({ to: input.to, err }, "email: send threw");
    return { ok: false, id: null, error: err instanceof Error ? err.message : "Send failed" };
  }
}
