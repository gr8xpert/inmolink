import { agencySchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  getMyAgency,
  updateMyAgencyBranding,
  updateMyAgencyDetails,
  updateMyAgencySettings,
  updateMyAgencyTranslations,
} from "./service";

type AgencyRoutesOpts = { storage: Storage };

const agencyIdQuery = z.object({ agencyId: z.string().min(1).optional() });

/**
 * `/api/dashboard/agency/*` — current user's agency. AGENCY_ADMIN gating
 * lives in the service so SUPER_ADMIN can pass `?agencyId=` to manage any
 * agency without re-implementing the gate per endpoint.
 */
export async function agencyRoutes(app: FastifyInstance, opts: AgencyRoutesOpts): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["agency"],
        summary: "Get my agency (details + translations + settings + branding URLs)",
        querystring: agencyIdQuery,
        response: { 200: agencySchemas.agencyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return getMyAgency(user, storage, request.query.agencyId);
    },
  );

  fastify.patch(
    "/details",
    {
      schema: {
        tags: ["agency"],
        summary: "Update agency name / slug / contact / socials / country / public",
        querystring: agencyIdQuery,
        body: agencySchemas.agencyDetailsUpdateSchema,
        response: { 200: agencySchemas.agencyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMyAgencyDetails(user, request.body, storage, request.query.agencyId);
    },
  );

  fastify.patch(
    "/branding",
    {
      schema: {
        tags: ["agency"],
        summary: "Update logo / banner / hero R2 keys",
        querystring: agencyIdQuery,
        body: agencySchemas.agencyBrandingUpdateSchema,
        response: { 200: agencySchemas.agencyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMyAgencyBranding(user, request.body, storage, request.query.agencyId);
    },
  );

  fastify.patch(
    "/translations",
    {
      schema: {
        tags: ["agency"],
        summary: "Replace per-locale description + meta",
        querystring: agencyIdQuery,
        body: agencySchemas.agencyTranslationsUpdateSchema,
        response: { 200: agencySchemas.agencyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMyAgencyTranslations(user, request.body, storage, request.query.agencyId);
    },
  );

  fastify.patch(
    "/settings",
    {
      schema: {
        tags: ["agency"],
        summary: "Update default commission / SLA windows",
        querystring: agencyIdQuery,
        body: agencySchemas.agencySettingsUpdateSchema,
        response: { 200: agencySchemas.agencyDetailSchema },
      },
    },
    async (request) => {
      const user = request.requireUser();
      return updateMyAgencySettings(user, request.body, storage, request.query.agencyId);
    },
  );
}
