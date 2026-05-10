import { createHash } from "node:crypto";
import { prisma } from "@inmolink/db";
import { leadSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/**
 * Public lead-capture (PLAN §11.4 row 27). Anonymous POST endpoint hit
 * from the property detail page contact form.
 *
 * Anti-abuse measures (a v1 baseline; tighter rules can layer on later):
 *
 *   - Honeypot: a hidden `companyName` field. Bots fill every input they
 *     see; humans never see this one (CSS-hidden in the form). Filled
 *     submissions return a fake-success 201 so scrapers can't distinguish
 *     hit from miss.
 *
 *   - Per-IP rate limit: 10/hour. Drops below dashboard auth limits since
 *     legit users send one or two leads, not dozens.
 *
 *   - Tight validation via the Zod schema (length caps, email shape, phone
 *     character set).
 *
 *   - IP stored as salted SHA-256 — we never write the raw value to DB.
 *
 *   - Cloudflare Turnstile: hooked but not verified yet — Sprint 4 wires
 *     the verify call. The schema accepts the token; we mark the row as
 *     `turnstileVerified=false` until then.
 *
 * Once accepted, we:
 *   1. Resolve the agencyId from propertyId (if source=PROPERTY_DETAIL)
 *      so the dashboard CRM can route to the right team.
 *   2. Store the Lead row with status=NEW.
 *   3. Return `{ ok: true, ref: lead.id.slice(-6) }` — 6-char user-facing
 *      reference number for the "we got it, ref #XYZ123" toast.
 *
 * Notification email is enqueued in Sprint 6 (notifications). For now the
 * row exists and the agency dashboard will surface it in the leads inbox
 * (also Sprint 6).
 */

function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function verifyTurnstile(secret: string, token: string, remoteip: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip }).toString(),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { success: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

export async function publicLeadRoutes(
  app: FastifyInstance,
  opts: { ipSalt: string; turnstileSecret?: string | undefined },
): Promise<void> {
  const { ipSalt, turnstileSecret } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.post(
    "/leads",
    {
      schema: {
        tags: ["public", "leads"],
        summary: "Submit a lead from the public marketplace",
        body: leadSchemas.leadCreateSchema,
        response: { 201: leadSchemas.leadCreateResponseSchema },
      },
      // Tighter than search since this writes — 10/hour per IP.
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const body = request.body;

      // Honeypot — bots fill, humans don't. Return a fake success so
      // scrapers can't tell a real hit from a miss.
      if (body.companyName && body.companyName.length > 0) {
        request.log.warn({ ip: request.ip }, "lead honeypot triggered");
        return reply.code(201).send({ ok: true as const, ref: "------" });
      }

      // Turnstile — only enforced when TURNSTILE_SECRET is configured.
      // Failed verification returns the same fake-success as honeypot hits.
      let turnstileVerified = false;
      if (turnstileSecret) {
        if (!body.turnstileToken) {
          request.log.warn({ ip: request.ip }, "lead missing Turnstile token");
          return reply.code(201).send({ ok: true as const, ref: "------" });
        }
        turnstileVerified = await verifyTurnstile(turnstileSecret, body.turnstileToken, request.ip);
        if (!turnstileVerified) {
          request.log.warn({ ip: request.ip }, "lead Turnstile verification failed");
          return reply.code(201).send({ ok: true as const, ref: "------" });
        }
      }

      // Resolve agencyId from the property if this is a property lead. We
      // do this server-side so a malicious client can't impersonate a
      // different agency by fudging the agencyId param.
      let resolvedAgencyId: string | null = null;
      if (body.source === "PROPERTY_DETAIL" && body.propertyId) {
        const property = await prisma.property.findFirst({
          where: {
            id: body.propertyId,
            visibility: "PUBLIC",
            status: "ACTIVE",
            deletedAt: null,
          },
          select: { ownerAgencyId: true },
        });
        if (!property) {
          // Property gone or not public — pretend acceptance, log warning.
          request.log.warn({ propertyId: body.propertyId }, "lead for missing/private property");
          return reply.code(201).send({ ok: true as const, ref: "------" });
        }
        resolvedAgencyId = property.ownerAgencyId;
      } else if (body.source === "AGENCY_PAGE" && body.agencyId) {
        // Verify the agency exists + is publicly listable.
        const agency = await prisma.agency.findFirst({
          where: { id: body.agencyId, isActive: true, isPublic: true },
          select: { id: true },
        });
        if (!agency) {
          return reply.code(201).send({ ok: true as const, ref: "------" });
        }
        resolvedAgencyId = body.agencyId;
      }

      const ipHash = hashIp(request.ip, ipSalt);
      const userAgent = request.headers["user-agent"]?.slice(0, 500) ?? null;

      const lead = await prisma.lead.create({
        data: {
          source: body.source,
          propertyId: body.source === "PROPERTY_DETAIL" && body.propertyId ? body.propertyId : null,
          agencyId: resolvedAgencyId,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          message: body.message,
          locale: body.locale,
          ipHash,
          userAgent,
          turnstileVerified,
          status: "NEW",
        },
        select: { id: true },
      });

      // 6-char user-facing ref. Cuid suffix is random enough to avoid
      // sequential leakage of total lead volume.
      const ref = lead.id.slice(-6).toUpperCase();
      return reply.code(201).send({ ok: true as const, ref });
    },
  );
}
