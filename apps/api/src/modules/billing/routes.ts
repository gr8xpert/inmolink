import { billingSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  createCheckoutSession,
  createPortalSession,
  getSummary,
  grantPlan,
  listAgenciesForAdmin,
  listInvoices,
  revokePlan,
  updateBillingDetails,
} from "./service";

type BillingRoutesOpts = {
  stripeSecretKey: string | undefined;
  stripeTaxEnabled: boolean;
  publicBaseUrl: string;
  prices: {
    proMonthlyEur?: string;
    proYearlyEur?: string;
    proMonthlyGbp?: string;
    proYearlyGbp?: string;
  };
};

const agencyIdQuery = z.object({ agencyId: z.string().min(1).optional() });

/**
 * `/api/dashboard/billing/*` — agency-scoped billing surface.
 * AGENCY_ADMIN gating in service; SUPER_ADMIN can pass `?agencyId=`.
 */
export async function billingRoutes(app: FastifyInstance, opts: BillingRoutesOpts): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();
  const ctx = opts;

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    const e = err as { code?: string; message?: string };
    if (e?.code === "BILLING_DISABLED") {
      return reply.code(503).send({
        statusCode: 503,
        code: "BILLING_DISABLED",
        message: e.message ?? "Billing disabled",
      });
    }
    throw err;
  });

  fastify.get(
    "/summary",
    {
      schema: {
        tags: ["billing"],
        summary: "Current plan + status + invoice list metadata",
        querystring: agencyIdQuery,
        response: { 200: billingSchemas.billingSummarySchema },
      },
    },
    async (request) => {
      return getSummary(request.requireUser(), ctx, request.query.agencyId);
    },
  );

  fastify.get(
    "/invoices",
    {
      schema: {
        tags: ["billing"],
        summary: "Last 50 Stripe invoices for the agency's subscription",
        querystring: agencyIdQuery,
        response: {
          200: z.object({ items: z.array(billingSchemas.subscriptionInvoiceSchema) }),
        },
      },
    },
    async (request) => {
      const items = await listInvoices(request.requireUser(), request.query.agencyId);
      return { items };
    },
  );

  fastify.patch(
    "/details",
    {
      schema: {
        tags: ["billing"],
        summary: "Update billing email + VAT (used for next checkout / next invoice)",
        querystring: agencyIdQuery,
        body: billingSchemas.billingDetailsSchema,
        response: { 200: billingSchemas.billingSummarySchema },
      },
    },
    async (request) => {
      return updateBillingDetails(request.requireUser(), request.body, request.query.agencyId);
    },
  );

  fastify.post(
    "/checkout",
    {
      schema: {
        tags: ["billing"],
        summary: "Create Stripe Checkout session — returns hosted URL",
        querystring: agencyIdQuery,
        body: billingSchemas.checkoutCreateSchema,
        response: { 200: billingSchemas.checkoutCreateResponseSchema },
      },
    },
    async (request) => {
      return createCheckoutSession(
        request.requireUser(),
        request.body,
        ctx,
        request.query.agencyId,
      );
    },
  );

  fastify.post(
    "/portal",
    {
      schema: {
        tags: ["billing"],
        summary: "Create Stripe Customer Portal session — returns hosted URL",
        querystring: agencyIdQuery,
        body: billingSchemas.portalCreateSchema,
        response: { 200: billingSchemas.portalCreateResponseSchema },
      },
    },
    async (request) => {
      return createPortalSession(request.requireUser(), request.body, ctx, request.query.agencyId);
    },
  );
}

/**
 * Super-admin manual grant + agency list. Mounted at /api/dashboard/admin/billing.
 */
export async function adminBillingRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ForbiddenError) {
      return reply.code(403).send({ statusCode: 403, code: err.code, message: err.message });
    }
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ statusCode: 404, code: err.code, message: err.message });
    }
    throw err;
  });

  fastify.get(
    "/agencies",
    {
      schema: {
        tags: ["billing", "admin"],
        summary: "Paginated agency list with subscription state (super-admin)",
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          q: z.string().optional(),
        }),
        response: { 200: billingSchemas.adminBillingListResponseSchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return listAgenciesForAdmin(request.requireUser(), request.query);
    },
  );

  fastify.post(
    "/grants",
    {
      schema: {
        tags: ["billing", "admin"],
        summary: "Grant plan tier to an agency (super-admin)",
        body: billingSchemas.manualGrantInputSchema,
        response: { 200: billingSchemas.billingSummarySchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return grantPlan(request.requireUser(), request.body);
    },
  );

  fastify.post(
    "/grants/revoke",
    {
      schema: {
        tags: ["billing", "admin"],
        summary: "Revoke manual grant — fall back to FREE (super-admin)",
        body: billingSchemas.manualGrantRevokeSchema,
        response: { 200: billingSchemas.billingSummarySchema },
      },
    },
    async (request) => {
      request.requireSuperAdmin();
      return revokePlan(request.requireUser(), request.body);
    },
  );
}
