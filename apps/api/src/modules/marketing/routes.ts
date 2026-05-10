import { marketingSchemas } from "@inmolink/shared";
import type { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireFeature } from "../billing/plan-tier";
import {
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  scheduleCampaign,
  sendCampaignNow,
  updateCampaign,
} from "./campaign-service";
import {
  createDomain,
  deleteDomain,
  listDomains,
  rotateDkimKey,
  verifyDomain,
} from "./domain-service";
import { createFeatured, deleteFeatured, listFeaturedAdmin } from "./featured-service";
import { buildMergeContext, renderMergeTags } from "./merge-tags";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  addSuppression,
  bulkUpsertContacts,
  createContact,
  createTemplate,
  deleteContact,
  deleteEmailConfig,
  deleteTemplate,
  getEmailConfig,
  getTemplate,
  listContacts,
  listSuppressions,
  listTemplates,
  removeSuppression,
  updateContact,
  updateTemplate,
  upsertEmailConfig,
} from "./service";

type MarketingRoutesOpts = {
  encryptionKeyHex: string;
  emailQueue: Queue;
  publicBaseUrl: string;
};

const agencyIdQuery = z.object({ agencyId: z.string().min(1).optional() });

function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    if (err instanceof ConflictError) {
      return reply.code(409).send({ statusCode: 409, code: err.code, message: err.message });
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "PLAN_REQUIRED"
    ) {
      const e = err as { message?: string };
      return reply.code(403).send({
        statusCode: 403,
        code: "PLAN_REQUIRED",
        requiredTier: "PRO",
        message: e.message ?? "Paid plan required",
      });
    }
    throw err;
  });
}

/**
 * `/api/dashboard/marketing/*` — agency-scoped marketing surface, all
 * gated behind `feature:marketing.campaigns` (PRO+). AGENCY_ADMIN-only;
 * SUPER_ADMIN may pass `?agencyId=`.
 */
export async function marketingRoutes(
  app: FastifyInstance,
  opts: MarketingRoutesOpts,
): Promise<void> {
  installErrorHandler(app);
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  // ---- AgencyEmailConfig ----
  fastify.get(
    "/email-config",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        response: {
          200: marketingSchemas.emailConfigSchema.nullable(),
        },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.smtp");
      return getEmailConfig(request.requireUser(), request.query.agencyId);
    },
  );

  fastify.put(
    "/email-config",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.emailConfigInputSchema,
        response: { 200: marketingSchemas.emailConfigSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.smtp");
      return upsertEmailConfig(
        request.requireUser(),
        request.body,
        opts.encryptionKeyHex,
        request.query.agencyId,
      );
    },
  );

  fastify.delete(
    "/email-config",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.smtp");
      await deleteEmailConfig(request.requireUser(), request.query.agencyId);
      return { ok: true as const };
    },
  );

  // ---- AgencyEmailDomain ----
  fastify.get(
    "/email-domains",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        response: { 200: z.object({ items: z.array(marketingSchemas.emailDomainSchema) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.customDomain");
      const items = await listDomains(request.requireUser(), request.query.agencyId);
      return { items };
    },
  );

  fastify.post(
    "/email-domains",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.emailDomainInputSchema,
        response: { 200: marketingSchemas.emailDomainSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.customDomain");
      return createDomain(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.delete(
    "/email-domains/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.customDomain");
      await deleteDomain(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  fastify.post(
    "/email-domains/:id/verify",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: marketingSchemas.emailDomainSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.customDomain");
      return verifyDomain(request.requireUser(), request.params.id, request.query.agencyId);
    },
  );

  fastify.post(
    "/email-domains/dkim/rotate",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        response: {
          200: z.object({ selector: z.string(), publicKey: z.string() }),
        },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.customDomain");
      return rotateDkimKey(request.requireUser(), opts.encryptionKeyHex, request.query.agencyId);
    },
  );

  // ---- EmailTemplate ----
  fastify.get(
    "/templates",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        response: { 200: z.object({ items: z.array(marketingSchemas.emailTemplateSchema) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      const items = await listTemplates(request.requireUser(), request.query.agencyId);
      return { items };
    },
  );

  fastify.get(
    "/templates/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: marketingSchemas.emailTemplateSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      return getTemplate(request.requireUser(), request.params.id, request.query.agencyId);
    },
  );

  fastify.post(
    "/templates",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.emailTemplateInputSchema,
        response: { 200: marketingSchemas.emailTemplateSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      return createTemplate(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.patch(
    "/templates/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: marketingSchemas.emailTemplateInputSchema,
        response: { 200: marketingSchemas.emailTemplateSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      return updateTemplate(
        request.requireUser(),
        request.params.id,
        request.body,
        request.query.agencyId,
      );
    },
  );

  fastify.delete(
    "/templates/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      await deleteTemplate(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  fastify.post(
    "/templates/preview",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.emailTemplatePreviewInputSchema,
        response: { 200: marketingSchemas.emailTemplatePreviewResponseSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.templates");
      const ctx = buildMergeContext({
        contact: { email: "preview@example.com", firstName: "Sample", lastName: "Contact" },
        agency: { name: "Your Agency" },
        property: { title: "Sample Property", url: `${opts.publicBaseUrl}/en/search` },
        unsubscribeUrl: `${opts.publicBaseUrl}/preview-unsubscribe`,
      });
      return {
        subject: renderMergeTags(request.body.subject, ctx, "text"),
        bodyHtml: renderMergeTags(request.body.bodyHtml, ctx, "html"),
        context: ctx,
      };
    },
  );

  // ---- EmailCampaign ----
  fastify.get(
    "/campaigns",
    {
      schema: {
        tags: ["marketing"],
        querystring: z.object({
          agencyId: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          status: marketingSchemas.campaignStatusSchema.optional(),
        }),
        response: { 200: marketingSchemas.campaignListResponseSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return listCampaigns(request.requireUser(), request.query, request.query.agencyId);
    },
  );

  fastify.get(
    "/campaigns/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return getCampaign(request.requireUser(), request.params.id, request.query.agencyId);
    },
  );

  fastify.post(
    "/campaigns",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.campaignInputSchema,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return createCampaign(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.patch(
    "/campaigns/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: marketingSchemas.campaignInputSchema,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return updateCampaign(
        request.requireUser(),
        request.params.id,
        request.body,
        request.query.agencyId,
      );
    },
  );

  fastify.delete(
    "/campaigns/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      await deleteCampaign(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  fastify.post(
    "/campaigns/:id/send-now",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return sendCampaignNow(
        request.requireUser(),
        request.params.id,
        request.query.agencyId,
        opts.emailQueue,
      );
    },
  );

  fastify.post(
    "/campaigns/:id/schedule",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: marketingSchemas.campaignScheduleInputSchema,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return scheduleCampaign(
        request.requireUser(),
        request.params.id,
        request.body.scheduledFor,
        request.query.agencyId,
      );
    },
  );

  fastify.post(
    "/campaigns/:id/cancel",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: marketingSchemas.campaignSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return cancelCampaign(request.requireUser(), request.params.id, request.query.agencyId);
    },
  );

  // ---- Suppressions ----
  fastify.get(
    "/suppressions",
    {
      schema: {
        tags: ["marketing"],
        querystring: z.object({
          agencyId: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
          q: z.string().optional(),
        }),
        response: { 200: marketingSchemas.suppressionListResponseSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.suppressions");
      return listSuppressions(request.requireUser(), request.query, request.query.agencyId);
    },
  );

  fastify.post(
    "/suppressions",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.suppressionInputSchema,
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.suppressions");
      return addSuppression(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.delete(
    "/suppressions/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.suppressions");
      await removeSuppression(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  // ---- Contacts ----
  fastify.get(
    "/contacts",
    {
      schema: {
        tags: ["marketing"],
        querystring: z.object({
          agencyId: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
          q: z.string().optional(),
          tag: z.string().optional(),
        }),
        response: { 200: marketingSchemas.contactListResponseSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return listContacts(request.requireUser(), request.query, request.query.agencyId);
    },
  );

  fastify.post(
    "/contacts",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.contactInputSchema,
        response: { 200: marketingSchemas.contactSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return createContact(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.patch(
    "/contacts/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        body: marketingSchemas.contactInputSchema,
        response: { 200: marketingSchemas.contactSchema },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return updateContact(
        request.requireUser(),
        request.params.id,
        request.body,
        request.query.agencyId,
      );
    },
  );

  fastify.delete(
    "/contacts/:id",
    {
      schema: {
        tags: ["marketing"],
        params: z.object({ id: z.string().min(1) }),
        querystring: agencyIdQuery,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      await deleteContact(request.requireUser(), request.params.id, request.query.agencyId);
      return { ok: true as const };
    },
  );

  fastify.post(
    "/contacts/bulk",
    {
      schema: {
        tags: ["marketing"],
        querystring: agencyIdQuery,
        body: marketingSchemas.contactBulkInputSchema,
        response: {
          200: z.object({ created: z.number().int(), updated: z.number().int() }),
        },
      },
    },
    async (request) => {
      await requireFeature(request, "feature:marketing.campaigns");
      return bulkUpsertContacts(
        request.requireUser(),
        request.body.contacts,
        request.query.agencyId,
      );
    },
  );
}

/**
 * `/api/dashboard/admin/featured-listings/*` — super-admin curation surface.
 */
export async function adminFeaturedListingRoutes(app: FastifyInstance): Promise<void> {
  installErrorHandler(app);
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/",
    {
      schema: {
        tags: ["marketing", "admin"],
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          surface: z.string().optional(),
          activeOnly: z.coerce.boolean().optional(),
        }),
        response: { 200: marketingSchemas.featuredListingListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listFeaturedAdmin(request.requireUser(), request.query);
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["marketing", "admin"],
        body: marketingSchemas.featuredListingInputSchema,
        response: { 200: marketingSchemas.featuredListingSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return createFeatured(request.requireUser(), request.body);
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["marketing", "admin"],
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      await deleteFeatured(request.requireUser(), request.params.id);
      return { ok: true as const };
    },
  );
}
