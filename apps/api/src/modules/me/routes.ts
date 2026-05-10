import { meSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  changeMyPassword,
  getMeForUser,
  getMySettings,
  updateMyProfile,
  updateMySettings,
} from "./service";

type MeRoutesOpts = { storage: Storage };

/**
 * `/api/dashboard/me/*` — the signed-in user's own profile + password +
 * preferences. All endpoints require authentication; nothing here can read
 * or mutate another user.
 */
export async function meRoutes(app: FastifyInstance, opts: MeRoutesOpts): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["me"],
        summary: "Get current user (profile + settings + 2FA flag)",
        response: { 200: meSchemas.meDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return getMeForUser(user, storage);
    },
  );

  fastify.patch(
    "/profile",
    {
      schema: {
        tags: ["me"],
        summary: "Update profile (name, slug, photo, contact, bio, languages)",
        body: meSchemas.profileUpdateSchema,
        response: { 200: meSchemas.meDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMyProfile(user, request.body, storage);
    },
  );

  fastify.patch(
    "/password",
    {
      // Tighter rate limit on password change to dampen credential-stuffing.
      // 5 attempts / 5 minutes per IP-and-route.
      config: { rateLimit: { max: 5, timeWindow: 5 * 60 * 1000 } },
      schema: {
        tags: ["me"],
        summary: "Change password (verify current + Argon2id rehash)",
        body: meSchemas.passwordChangeSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = request.requireUser();
      await changeMyPassword(user, request.body);
      return reply.code(204).send(null);
    },
  );

  fastify.get(
    "/settings",
    {
      schema: {
        tags: ["me"],
        summary: "Get notification + locale preferences",
        response: { 200: meSchemas.userSettingsSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return getMySettings(user);
    },
  );

  fastify.patch(
    "/settings",
    {
      schema: {
        tags: ["me"],
        summary: "Update notification + locale preferences",
        body: meSchemas.userSettingsUpdateSchema,
        response: { 200: meSchemas.userSettingsSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMySettings(user, request.body);
    },
  );
}
