import { prisma } from "@inmolink/db";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { getStripeClient, processStripeEvent } from "../../lib/stripe";

type WebhookOpts = {
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
};

/**
 * Stripe webhook receiver. Mounted at /api/billing/webhooks/stripe.
 *
 * Critical wiring:
 * - We add a content-type parser scoped to this plugin only that captures
 *   the raw bytes (so signature verification works). Fastify's default JSON
 *   parser would consume the body and break HMAC.
 * - The route is NOT registered when STRIPE_SECRET_KEY/WEBHOOK_SECRET are
 *   unset — keeps dev surface minimal.
 * - All work flows through `processStripeEvent` so re-deliveries collapse
 *   on the ProcessedStripeEvent unique constraint.
 */
export async function stripeWebhookRoutes(app: FastifyInstance, opts: WebhookOpts): Promise<void> {
  if (!opts.stripeSecretKey || !opts.stripeWebhookSecret) {
    app.log.info("Stripe webhook receiver not mounted (missing env)");
    return;
  }
  const secretKey = opts.stripeSecretKey;
  const webhookSecret = opts.stripeWebhookSecret;
  const stripe = getStripeClient(secretKey);

  // Capture raw body — required for stripe.webhooks.constructEvent.
  // Scoped to this encapsulated plugin context so other routes still get
  // Fastify's default JSON parsing.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );

  app.post("/stripe", async (request, reply) => {
    const sig = request.headers["stripe-signature"];
    if (!sig || Array.isArray(sig)) {
      return reply.code(400).send({ message: "Missing stripe-signature header" });
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "verify failed";
      request.log.warn({ err: msg }, "Stripe webhook signature verification failed");
      return reply.code(400).send({ message: `Webhook Error: ${msg}` });
    }

    const result = await processStripeEvent(event, async () => {
      await dispatchEvent(event, request.log);
    });

    return reply.code(200).send({ received: true, processed: result.processed });
  });
}

// ---- Handlers ----

type Logger = { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };

async function dispatchEvent(event: Stripe.Event, log: Logger): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, log);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await onSubscriptionUpsert(event.data.object as Stripe.Subscription, log);
      return;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription, log);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalized":
    case "invoice.voided":
      await onInvoiceUpsert(event.data.object as Stripe.Invoice, log);
      return;
    case "customer.tax_id.created":
    case "customer.tax_id.updated":
      await onTaxIdValidated(event.data.object as Stripe.TaxId, log);
      return;
    default:
      log.info({ type: event.type }, "Stripe webhook: unhandled event");
  }
}

function planTierFromPriceId(priceId: string | null | undefined): "FREE" | "PRO" {
  if (!priceId) return "FREE";
  const proPrices = [
    process.env.STRIPE_PRICE_PRO_MONTHLY_EUR,
    process.env.STRIPE_PRICE_PRO_YEARLY_EUR,
    process.env.STRIPE_PRICE_PRO_MONTHLY_GBP,
    process.env.STRIPE_PRICE_PRO_YEARLY_GBP,
  ].filter(Boolean) as string[];
  return proPrices.includes(priceId) ? "PRO" : "FREE";
}

function billingCycleFromInterval(
  interval: Stripe.Price.Recurring.Interval | undefined,
): "MONTHLY" | "YEARLY" | null {
  if (interval === "month") return "MONTHLY";
  if (interval === "year") return "YEARLY";
  return null;
}

function statusFromStripe(s: Stripe.Subscription.Status): {
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE" | "UNPAID" | "PAUSED";
} {
  switch (s) {
    case "active":
    case "trialing":
      return { status: "ACTIVE" };
    case "past_due":
      return { status: "PAST_DUE" };
    case "canceled":
      return { status: "CANCELLED" };
    case "unpaid":
      return { status: "UNPAID" };
    case "paused":
      return { status: "PAUSED" };
    default:
      return { status: "INCOMPLETE" };
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session, log: Logger): Promise<void> {
  // We don't trust client_reference_id alone — re-resolve agency by Stripe
  // customer when we already have one. New checkouts pre-create the
  // AgencySubscription.stripeCustomerId, so this find should succeed.
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) {
    log.warn({ id: session.id }, "checkout.session.completed without customer");
    return;
  }
  // Subsequent customer.subscription.* events do the heavy lifting; we just
  // ensure the AgencySubscription row exists with the correct stripeCustomerId.
  const sub = await prisma.agencySubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!sub) {
    log.warn({ customerId }, "checkout.session.completed for unknown customer");
  }
}

async function onSubscriptionUpsert(sub: Stripe.Subscription, log: Logger): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price.id ?? null;
  const interval = sub.items.data[0]?.price.recurring?.interval;
  const currency = (sub.items.data[0]?.price.currency ?? sub.currency)?.toUpperCase() ?? null;
  const planTier = planTierFromPriceId(priceId);
  const { status } = statusFromStripe(sub.status);

  // Stripe's subscription.current_period_* fields live on the first
  // subscription item in newer API versions; fall back to legacy fields on
  // the subscription itself.
  type LegacyPeriods = { current_period_start?: number; current_period_end?: number };
  const legacy = sub as unknown as LegacyPeriods;
  const item = sub.items.data[0] as (Stripe.SubscriptionItem & LegacyPeriods) | undefined;
  const startEpoch = item?.current_period_start ?? legacy.current_period_start;
  const endEpoch = item?.current_period_end ?? legacy.current_period_end;
  const periodStart = startEpoch ? new Date(startEpoch * 1000) : null;
  const periodEnd = endEpoch ? new Date(endEpoch * 1000) : null;

  const existing = await prisma.agencySubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, agencyId: true, planTier: true, grantedManually: true },
  });

  if (!existing) {
    log.warn(
      { customerId, subId: sub.id },
      "subscription event without matching AgencySubscription row",
    );
    return;
  }
  // Manual grant takes precedence — Stripe state is recorded but doesn't
  // override planTier until the grant lapses. The next request that calls
  // `getCurrentPlanTier` re-evaluates based on grantedUntil.
  const updateData: Parameters<typeof prisma.agencySubscription.update>[0]["data"] = {
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    billingCycle: billingCycleFromInterval(interval),
    currency,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
  };
  if (!existing.grantedManually) {
    updateData.planTier = planTier;
  }

  const previousTier = existing.planTier;
  await prisma.agencySubscription.update({
    where: { id: existing.id },
    data: updateData,
  });

  if (!existing.grantedManually && previousTier !== planTier) {
    await prisma.auditLog.create({
      data: {
        type: "PLAN_CHANGED",
        agencyId: existing.agencyId,
        targetKind: "Agency",
        targetId: existing.agencyId,
        metadata: {
          from: previousTier,
          to: planTier,
          stripeSubscriptionId: sub.id,
        },
      },
    });
  }
}

async function onSubscriptionDeleted(sub: Stripe.Subscription, log: Logger): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const existing = await prisma.agencySubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, agencyId: true, planTier: true, grantedManually: true },
  });
  if (!existing) {
    log.warn({ customerId }, "subscription.deleted for unknown customer");
    return;
  }
  await prisma.agencySubscription.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false,
      planTier: existing.grantedManually ? existing.planTier : "FREE",
    },
  });
  if (!existing.grantedManually && existing.planTier !== "FREE") {
    await prisma.auditLog.create({
      data: {
        type: "PLAN_CHANGED",
        agencyId: existing.agencyId,
        targetKind: "Agency",
        targetId: existing.agencyId,
        metadata: { from: existing.planTier, to: "FREE", reason: "subscription_deleted" },
      },
    });
  }
}

async function onInvoiceUpsert(invoice: Stripe.Invoice, log: Logger): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) {
    log.warn({ id: invoice.id }, "invoice event without customer");
    return;
  }
  const existing = await prisma.agencySubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!existing) {
    log.warn({ customerId }, "invoice event for unknown customer");
    return;
  }
  // `period` lives on each invoice line; the subscription line is the
  // representative one for monthly/yearly billing.
  const subLine = invoice.lines.data.find((l) => l.subscription) ?? invoice.lines.data[0];
  const periodStart = subLine?.period?.start
    ? new Date(subLine.period.start * 1000)
    : new Date(invoice.created * 1000);
  const periodEnd = subLine?.period?.end ? new Date(subLine.period.end * 1000) : periodStart;

  // Some invoice statuses we don't get an explicit `paid` field for — derive
  // a normalized status string from `invoice.status`.
  const stripeStatus = invoice.status ?? "open";

  // `id` is optional on Stripe's invoice type for draft invoices that
  // never finalized; skip persisting until they have one.
  if (!invoice.id) {
    return;
  }

  await prisma.subscriptionInvoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      subscriptionId: existing.id,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.subtotal ?? invoice.amount_due ?? 0,
      taxCents: Math.max(0, (invoice.total ?? 0) - (invoice.subtotal ?? 0)),
      totalCents: invoice.total ?? invoice.amount_due ?? 0,
      currency: invoice.currency.toUpperCase(),
      status: stripeStatus,
      paidAt:
        stripeStatus === "paid" && invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      periodStart,
      periodEnd,
    },
    update: {
      amountCents: invoice.subtotal ?? invoice.amount_due ?? 0,
      taxCents: Math.max(0, (invoice.total ?? 0) - (invoice.subtotal ?? 0)),
      totalCents: invoice.total ?? invoice.amount_due ?? 0,
      status: stripeStatus,
      paidAt:
        stripeStatus === "paid" && invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
  });
}

async function onTaxIdValidated(taxId: Stripe.TaxId, log: Logger): Promise<void> {
  const customerId = typeof taxId.customer === "string" ? taxId.customer : taxId.customer?.id;
  if (!customerId) return;
  const sub = await prisma.agencySubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { agencyId: true },
  });
  if (!sub) {
    log.warn({ customerId }, "tax_id event for unknown customer");
    return;
  }
  // Stripe's verification.status flips to "verified" once their VIES
  // crosscheck succeeds. Anything else (pending / unverified / unavailable)
  // stays false so we charge VAT until verified.
  const verified = taxId.verification?.status === "verified";
  await prisma.agency.update({
    where: { id: sub.agencyId },
    data: {
      taxIdValidated: verified,
      vatNumber: taxId.value,
      vatCountryCode: taxId.country ?? null,
    },
  });
}
