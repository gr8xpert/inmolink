import { prisma } from "@inmolink/db";
import { marketingSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireFeature } from "../billing/plan-tier";
import { ForbiddenError, NotFoundError, getDecryptedConfig, resolveAgencyId } from "./service";
import { createAgencyTransport, fromHeaderFor } from "./smtp";

type Opts = {
  encryptionKeyHex: string;
};

/**
 * Synchronous test-send. Mounted under the same prefix as the rest of the
 * marketing routes; kept in its own file because it touches nodemailer and
 * we don't want the rest of the surface to pull that import path on every
 * route registration.
 */
export async function emailConfigTestSendRoute(app: FastifyInstance, opts: Opts): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.post(
    "/email-config/test-send",
    {
      schema: {
        tags: ["marketing"],
        querystring: z.object({ agencyId: z.string().optional() }),
        body: marketingSchemas.emailConfigTestSendInputSchema,
        response: {
          200: z.object({
            ok: z.boolean(),
            messageId: z.string().optional(),
            error: z.string().optional(),
          }),
        },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.smtp");
      const user = request.requireUser();
      const agencyId = resolveAgencyId(user, request.query.agencyId);
      const decrypted = await getDecryptedConfig(agencyId, opts.encryptionKeyHex);
      if (!decrypted) throw new NotFoundError("Email config not found");

      const to = request.body.to ?? user.email;
      if (!to) throw new ForbiddenError("No recipient (caller has no email)");

      const transport = createAgencyTransport(decrypted);
      try {
        const info = await transport.sendMail({
          from: fromHeaderFor({ fromEmail: decrypted.fromEmail, fromName: decrypted.fromName }),
          to,
          subject: "Inmolink — SMTP test",
          text: "This is a test message from Inmolink. If you can read this, your SMTP is configured correctly.",
          html: "<p>This is a test message from Inmolink.</p><p>If you can read this, your SMTP is configured correctly.</p>",
        });
        await prisma.agencyEmailConfig.update({
          where: { agencyId },
          data: { testStatus: "OK", testedAt: new Date() },
        });
        return { ok: true, messageId: info.messageId };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Test send failed";
        await prisma.agencyEmailConfig.update({
          where: { agencyId },
          data: { testStatus: "FAIL", testedAt: new Date() },
        });
        return { ok: false, error: message };
      } finally {
        transport.close();
      }
    },
  );
}
