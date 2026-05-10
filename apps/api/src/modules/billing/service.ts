import { prisma } from "@inmolink/db";
import type { PlanTier, billingSchemas } from "@inmolink/shared";
import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { type BillingDisabledError, getStripeClient } from "../../lib/stripe";
import type { AuthenticatedUser } from "../../plugins/auth";
import { getCurrentPlanTier } from "./plan-tier";

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "Not allowed") {
    super(message);
  }
}
export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Not found") {
    super(message);
  }
}

/**
 * Resolve the agency the caller is allowed to act on.
 * - SUPER_ADMIN: may pass `?agencyId=`; otherwise their own.
 * - AGENCY_ADMIN: their own agency only.
 * - AGENT: blocked (billing is admin-only).
 */
function resolveAgencyId(user: AuthenticatedUser, queryAgencyId?: string): string {
  if (user.role === "SUPER_ADMIN") {
    const id = queryAgencyId ?? user.agencyId;
    if (!id) {
      throw new ForbiddenError("Provide ?agencyId= when super-admin has no home agency");
    }
    return id;
  }
  if (user.role !== "AGENCY_ADMIN") {
    throw new ForbiddenError("AGENCY_ADMIN role required");
  }
  if (!user.agencyId) throw new ForbiddenError("User has no agency");
  if (queryAgencyId && queryAgencyId !== user.agencyId) {
    throw new ForbiddenError("Cannot manage another agency's billing");
  }
  return user.agencyId;
}

type CtxOpts = {
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

function priceFor(
  prices: CtxOpts["prices"],
  cycle: "MONTHLY" | "YEARLY",
  currency: "EUR" | "GBP",
): string | undefined {
  if (cycle === "MONTHLY" && currency === "EUR") return prices.proMonthlyEur;
  if (cycle === "YEARLY" && currency === "EUR") return prices.proYearlyEur;
  if (cycle === "MONTHLY" && currency === "GBP") return prices.proMonthlyGbp;
  if (cycle === "YEARLY" && currency === "GBP") return prices.proYearlyGbp;
  return undefined;
}

export async function getSummary(
  user: AuthenticatedUser,
  ctx: CtxOpts,
  queryAgencyId: string | undefined,
): Promise<billingSchemas.BillingSummary> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const [agency, sub] = await Promise.all([
    prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        billingEmail: true,
        vatNumber: true,
        vatCountryCode: true,
        taxIdValidated: true,
      },
    }),
    prisma.agencySubscription.findUnique({
      where: { agencyId },
      select: {
        planTier: true,
        status: true,
        billingCycle: true,
        currency: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        cancelledAt: true,
        grantedManually: true,
        grantedUntil: true,
        grantedReason: true,
        stripeCustomerId: true,
      },
    }),
  ]);
  if (!agency) throw new NotFoundError("Agency not found");

  // Reflect effective tier (manual-grant lapse + non-good-standing fall back to FREE)
  const effectiveTier = await getCurrentPlanTier(agencyId);

  return {
    agencyId,
    planTier: effectiveTier,
    status: (sub?.status ?? "ACTIVE") as billingSchemas.SubscriptionStatus,
    billingCycle: (sub?.billingCycle ?? null) as billingSchemas.BillingCycle | null,
    currency: (sub?.currency ?? null) as billingSchemas.BillingCurrency | null,
    currentPeriodStart: sub?.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    cancelledAt: sub?.cancelledAt?.toISOString() ?? null,
    grantedManually: sub?.grantedManually ?? false,
    grantedUntil: sub?.grantedUntil?.toISOString() ?? null,
    grantedReason: sub?.grantedReason ?? null,
    billingEnabled: Boolean(ctx.stripeSecretKey),
    hasStripeCustomer: Boolean(sub?.stripeCustomerId),
    vatNumber: agency.vatNumber,
    vatCountryCode: agency.vatCountryCode,
    taxIdValidated: agency.taxIdValidated,
    billingEmail: agency.billingEmail,
  };
}

export async function listInvoices(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<billingSchemas.SubscriptionInvoice[]> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const sub = await prisma.agencySubscription.findUnique({
    where: { agencyId },
    select: { id: true },
  });
  if (!sub) return [];
  const rows = await prisma.subscriptionInvoice.findMany({
    where: { subscriptionId: sub.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    stripeInvoiceId: r.stripeInvoiceId,
    amountCents: r.amountCents,
    taxCents: r.taxCents,
    totalCents: r.totalCents,
    currency: r.currency,
    status: r.status,
    paidAt: r.paidAt?.toISOString() ?? null,
    invoicePdfUrl: r.invoicePdfUrl,
    hostedInvoiceUrl: r.hostedInvoiceUrl,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function updateBillingDetails(
  user: AuthenticatedUser,
  input: billingSchemas.BillingDetailsInput,
  queryAgencyId: string | undefined,
): Promise<billingSchemas.BillingSummary> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  await prisma.agency.update({
    where: { id: agencyId },
    data: {
      billingEmail: input.billingEmail,
      vatNumber: input.vatNumber,
      vatCountryCode: input.vatCountryCode,
      // Editing the VAT number invalidates any prior Stripe validation;
      // webhook from `customer.tax_id.created` re-flips this to true.
      taxIdValidated: false,
    },
  });
  return getSummary(user, makeReadOnlyCtx(), queryAgencyId);
}

// Used when summary needs to be re-fetched but we only have access to flags
function makeReadOnlyCtx(): CtxOpts {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeTaxEnabled: process.env.STRIPE_TAX_ENABLED === "true",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    prices: {
      proMonthlyEur: process.env.STRIPE_PRICE_PRO_MONTHLY_EUR,
      proYearlyEur: process.env.STRIPE_PRICE_PRO_YEARLY_EUR,
      proMonthlyGbp: process.env.STRIPE_PRICE_PRO_MONTHLY_GBP,
      proYearlyGbp: process.env.STRIPE_PRICE_PRO_YEARLY_GBP,
    },
  };
}

/**
 * Idempotently get-or-create a Stripe Customer for the agency. Persists
 * stripeCustomerId on AgencySubscription (creating a row on first call).
 */
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  agencyId: string,
): Promise<{ customerId: string }> {
  const [agency, existing] = await Promise.all([
    prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        name: true,
        billingEmail: true,
        email: true,
        vatNumber: true,
        vatCountryCode: true,
        countryCode: true,
      },
    }),
    prisma.agencySubscription.findUnique({
      where: { agencyId },
      select: { stripeCustomerId: true },
    }),
  ]);
  if (!agency) throw new NotFoundError("Agency not found");
  if (existing?.stripeCustomerId) {
    return { customerId: existing.stripeCustomerId };
  }
  const customer = await stripe.customers.create({
    name: agency.name,
    email: agency.billingEmail ?? agency.email ?? undefined,
    metadata: { agencyId },
    address: agency.countryCode ? { country: agency.countryCode } : undefined,
  });
  await prisma.agencySubscription.upsert({
    where: { agencyId },
    create: { agencyId, stripeCustomerId: customer.id, planTier: "FREE", status: "ACTIVE" },
    update: { stripeCustomerId: customer.id },
  });
  return { customerId: customer.id };
}

export async function createCheckoutSession(
  user: AuthenticatedUser,
  input: billingSchemas.CheckoutCreateInput,
  ctx: CtxOpts,
  queryAgencyId: string | undefined,
): Promise<{ url: string }> {
  const stripe = getStripeClient(ctx.stripeSecretKey);
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const priceId = priceFor(ctx.prices, input.cycle, input.currency);
  if (!priceId) {
    throw new ForbiddenError(
      `No Stripe price configured for ${input.cycle} ${input.currency}; ask super-admin to set it`,
    );
  }
  const { customerId } = await getOrCreateStripeCustomer(stripe, agencyId);

  const successUrl = `${ctx.publicBaseUrl}${input.successPath ?? "/dashboard/billing?checkout=success"}`;
  const cancelUrl = `${ctx.publicBaseUrl}${input.cancelPath ?? "/dashboard/billing?checkout=cancelled"}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Stripe Tax — when enabled it computes VAT + reverse-charge automatically.
    automatic_tax: ctx.stripeTaxEnabled ? { enabled: true } : undefined,
    // Collect VAT IDs at checkout for B2B reverse-charge inside the EU.
    tax_id_collection: ctx.stripeTaxEnabled ? { enabled: true } : undefined,
    // We need Stripe to write back the captured address/name to the customer
    // so subsequent invoices keep them; required when automatic_tax is on.
    customer_update: ctx.stripeTaxEnabled ? { address: "auto", name: "auto" } : undefined,
    billing_address_collection: ctx.stripeTaxEnabled ? "required" : "auto",
    allow_promotion_codes: true,
    client_reference_id: agencyId,
    metadata: { agencyId, cycle: input.cycle, currency: input.currency },
    subscription_data: {
      metadata: { agencyId },
    },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout session missing url");
  }
  return { url: session.url };
}

export async function createPortalSession(
  user: AuthenticatedUser,
  input: billingSchemas.PortalCreateInput,
  ctx: CtxOpts,
  queryAgencyId: string | undefined,
): Promise<{ url: string }> {
  const stripe = getStripeClient(ctx.stripeSecretKey);
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const sub = await prisma.agencySubscription.findUnique({
    where: { agencyId },
    select: { stripeCustomerId: true },
  });
  if (!sub?.stripeCustomerId) {
    throw new ForbiddenError("No Stripe customer for agency — start a checkout first");
  }
  const returnUrl = `${ctx.publicBaseUrl}${input.returnPath ?? "/dashboard/billing"}`;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

// ---- Super-admin manual grants ----

export async function grantPlan(
  actor: AuthenticatedUser,
  input: billingSchemas.ManualGrantInput,
): Promise<billingSchemas.BillingSummary> {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  const agency = await prisma.agency.findUnique({
    where: { id: input.agencyId },
    select: { id: true },
  });
  if (!agency) throw new NotFoundError("Agency not found");

  const grantedUntil = input.grantedUntil ? new Date(input.grantedUntil) : null;

  await prisma.$transaction([
    prisma.agencySubscription.upsert({
      where: { agencyId: input.agencyId },
      create: {
        agencyId: input.agencyId,
        planTier: input.planTier,
        status: "ACTIVE",
        grantedManually: true,
        grantedById: actor.id,
        grantedReason: input.grantedReason,
        grantedUntil,
      },
      update: {
        planTier: input.planTier,
        status: "ACTIVE",
        grantedManually: true,
        grantedById: actor.id,
        grantedReason: input.grantedReason,
        grantedUntil,
      },
    }),
    prisma.auditLog.create({
      data: {
        type: "PLAN_GRANTED_MANUALLY",
        actorUserId: actor.id,
        targetKind: "Agency",
        targetId: input.agencyId,
        agencyId: input.agencyId,
        metadata: {
          planTier: input.planTier,
          grantedUntil: grantedUntil?.toISOString() ?? null,
          reason: input.grantedReason,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  return getSummary(actor, makeReadOnlyCtx(), input.agencyId);
}

export async function revokePlan(
  actor: AuthenticatedUser,
  input: billingSchemas.ManualGrantRevokeInput,
): Promise<billingSchemas.BillingSummary> {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  await prisma.$transaction([
    prisma.agencySubscription.update({
      where: { agencyId: input.agencyId },
      data: {
        planTier: "FREE",
        status: "ACTIVE",
        grantedManually: false,
        grantedById: null,
        grantedReason: null,
        grantedUntil: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        type: "PLAN_REVOKED",
        actorUserId: actor.id,
        targetKind: "Agency",
        targetId: input.agencyId,
        agencyId: input.agencyId,
        metadata: { reason: input.reason ?? null } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return getSummary(actor, makeReadOnlyCtx(), input.agencyId);
}

export async function listAgenciesForAdmin(
  actor: AuthenticatedUser,
  query: { cursor?: string; limit?: number; q?: string },
): Promise<{
  items: billingSchemas.AdminBillingAgencyRow[];
  nextCursor: string | null;
}> {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Super-admin only");
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);

  const decoded = (() => {
    if (!query.cursor) return null;
    try {
      return JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as {
        createdAt: string;
        id: string;
      };
    } catch {
      return null;
    }
  })();

  const where: Prisma.AgencyWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (decoded) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const rows = await prisma.agency.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      slug: true,
      billingEmail: true,
      createdAt: true,
      subscription: {
        select: {
          planTier: true,
          status: true,
          grantedManually: true,
          grantedUntil: true,
          grantedReason: true,
          currentPeriodEnd: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor =
    hasMore && tail
      ? Buffer.from(
          JSON.stringify({ createdAt: tail.createdAt.toISOString(), id: tail.id }),
        ).toString("base64url")
      : null;

  return {
    items: slice.map((a) => ({
      agencyId: a.id,
      agencyName: a.name,
      agencySlug: a.slug,
      planTier: (a.subscription?.planTier ?? "FREE") as PlanTier,
      status: (a.subscription?.status ?? "ACTIVE") as billingSchemas.SubscriptionStatus,
      grantedManually: a.subscription?.grantedManually ?? false,
      grantedUntil: a.subscription?.grantedUntil?.toISOString() ?? null,
      grantedReason: a.subscription?.grantedReason ?? null,
      billingEmail: a.billingEmail,
      currentPeriodEnd: a.subscription?.currentPeriodEnd?.toISOString() ?? null,
    })),
    nextCursor,
  };
}

// Help the lint/types — re-export for routes.ts
export type { BillingDisabledError };
