import { twoFactorSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config";
import { writeAuditLog } from "../../lib/audit";
import { completeEnrollment, disableTwoFactor, startEnrollment } from "./service";

type TwoFactorRoutesOpts = { env: Env };

/**
 * `/api/dashboard/me/two-factor/*` — TOTP enroll / verify / disable.
 * All endpoints require auth + tighter rate limits to dampen brute-force
 * on the 6-digit code surface.
 */
export async function twoFactorRoutes(
  app: FastifyInstance,
  opts: TwoFactorRoutesOpts,
): Promise<void> {
  const { env } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.post(
    "/enroll",
    {
      config: { rateLimit: { max: 10, timeWindow: 60 * 60 * 1000 } },
      schema: {
        tags: ["me", "two-factor"],
        summary: "Begin 2FA enrollment (returns secret + otpauth URL)",
        response: { 200: twoFactorSchemas.totpEnrollResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return startEnrollment(user, env);
    },
  );

  fastify.post(
    "/verify",
    {
      // 5 attempts / 5 min — dampens online brute-force of 6-digit code.
      config: { rateLimit: { max: 5, timeWindow: 5 * 60 * 1000 } },
      schema: {
        tags: ["me", "two-factor"],
        summary: "Verify password + first 6-digit code → enable 2FA + return recovery codes",
        body: twoFactorSchemas.totpVerifySchema,
        response: { 200: twoFactorSchemas.totpVerifyResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      const r = await completeEnrollment(user, request.body, env);
      await writeAuditLog({
        type: "TOTP_ENABLED",
        request,
        actorUserId: user.id,
        agencyId: user.agencyId,
        targetKind: "User",
        targetId: user.id,
      });
      return r;
    },
  );

  fastify.post(
    "/disable",
    {
      config: { rateLimit: { max: 5, timeWindow: 5 * 60 * 1000 } },
      schema: {
        tags: ["me", "two-factor"],
        summary: "Disable 2FA (requires password + TOTP or recovery code)",
        body: twoFactorSchemas.totpDisableSchema,
        response: { 200: z.object({ disabled: z.literal(true) }) },
      },
    },
    async (request) => {
      const user = request.requireUser();
      const r = await disableTwoFactor(user, request.body, env);
      await writeAuditLog({
        type: "TOTP_DISABLED",
        request,
        actorUserId: user.id,
        agencyId: user.agencyId,
        targetKind: "User",
        targetId: user.id,
      });
      return r;
    },
  );
}
