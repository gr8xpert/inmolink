import { inviteSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config";
import {
  acceptInviteAsExistingUser,
  acceptInviteAsNewUser,
  createInviteForAgency,
  getInviteForAccept,
  getTeam,
  resendInvite,
  revokeInvite,
} from "./service";

type DashboardOpts = { storage: Storage; env: Env };
type PublicOpts = { storage: Storage };

const localeQuery = z.object({
  locale: z.enum(["en", "es", "de", "fr"]).default("en"),
});

const tokenParam = z.object({ token: z.string().min(32).max(128) });

/** Dashboard surface: AGENCY_ADMIN-gated team + invite management. */
export async function dashboardInviteRoutes(
  app: FastifyInstance,
  opts: DashboardOpts,
): Promise<void> {
  const { storage, env } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/team",
    {
      schema: {
        tags: ["agency", "team"],
        summary: "List agency members + pending invites",
        response: { 200: inviteSchemas.teamResponseSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return getTeam(user, storage);
    },
  );

  fastify.post(
    "/invites",
    {
      schema: {
        tags: ["agency", "team"],
        summary: "Send an invite (creates row + emails accept link)",
        querystring: localeQuery,
        body: inviteSchemas.inviteCreateSchema,
        response: { 201: inviteSchemas.inviteSummarySchema },
      },
    },
    async (request, reply) => {
      const user = request.requireUser();
      const summary = await createInviteForAgency(
        user,
        request.body,
        env,
        request.log,
        request.query.locale,
      );
      return reply.code(201).send(summary);
    },
  );

  fastify.post(
    "/invites/:id/resend",
    {
      schema: {
        tags: ["agency", "team"],
        summary: "Re-issue token + re-send the invite email",
        querystring: localeQuery,
        params: z.object({ id: z.string().min(1) }),
        response: { 200: inviteSchemas.inviteSummarySchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return resendInvite(user, request.params.id, env, request.log, request.query.locale);
    },
  );

  fastify.delete(
    "/invites/:id",
    {
      schema: {
        tags: ["agency", "team"],
        summary: "Revoke a pending invite",
        params: z.object({ id: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = request.requireUser();
      await revokeInvite(user, request.params.id);
      return reply.code(204).send(null);
    },
  );
}

/** Public surface: anonymous read of invite + accept (new account or
 * existing). Rate-limited tighter than the default. */
export async function publicInviteRoutes(app: FastifyInstance, opts: PublicOpts): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/invites/:token",
    {
      // Anonymous lookup — keep it tight to dampen token-guessing attempts.
      // 32-byte tokens are unguessable at any rate limit; this just stops
      // log spam from a misbehaving client.
      config: { rateLimit: { max: 60, timeWindow: 60_000 } },
      schema: {
        tags: ["invites"],
        summary: "Look up invite by token (anonymous)",
        params: tokenParam,
        response: { 200: inviteSchemas.inviteForAcceptSchema },
      },
    },
    async (request) => {
      return getInviteForAccept(request.params.token, storage);
    },
  );

  fastify.post(
    "/invites/:token/accept-new",
    {
      config: { rateLimit: { max: 5, timeWindow: 60 * 60 * 1000 } },
      schema: {
        tags: ["invites"],
        summary: "Accept invite as a new user (creates account + attaches)",
        params: tokenParam,
        body: inviteSchemas.inviteAcceptNewSchema,
        response: {
          201: z.object({ userId: z.string(), agencyId: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const out = await acceptInviteAsNewUser(request.params.token, request.body);
      return reply.code(201).send(out);
    },
  );

  fastify.post(
    "/invites/:token/accept-existing",
    {
      schema: {
        tags: ["invites"],
        summary: "Accept invite as the currently signed-in user",
        params: tokenParam,
        response: {
          200: z.object({ userId: z.string(), agencyId: z.string() }),
        },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return acceptInviteAsExistingUser(user, request.params.token);
    },
  );
}
