import { prisma } from "@inmolink/db";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

let _client: Stripe | null = null;

/**
 * Returns a memoized Stripe client. Throws when STRIPE_SECRET_KEY is not
 * configured — callers behind the billing routes wrap this in a check that
 * surfaces 503 BILLING_DISABLED so dev environments without Stripe boot.
 */
export function getStripeClient(secretKey: string | undefined): Stripe {
  if (!secretKey) {
    throw new BillingDisabledError();
  }
  if (_client) return _client;
  _client = new Stripe(secretKey, {
    // Pin API version so behavior is deterministic across SDK upgrades.
    apiVersion: "2026-04-22.dahlia",
    appInfo: { name: "Inmolink", version: "0.0.0" },
    // Stripe SDK retries idempotent requests by default; raise to 3 so
    // transient timeouts on Checkout/Portal don't break the user flow.
    maxNetworkRetries: 3,
    timeout: 20_000,
  });
  return _client;
}

export class BillingDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = "BILLING_DISABLED";
  constructor() {
    super("Billing is not configured on this environment");
    this.name = "BillingDisabledError";
  }
}

/**
 * Idempotent dispatch wrapper around ProcessedStripeEvent. Stripe webhooks
 * can re-deliver after our handler crashes mid-flight or the network blips,
 * so we record `stripeEventId` first and short-circuit on duplicate.
 *
 * Race-collapse: P2002 unique-violation on the insert means another delivery
 * already won the race — return without invoking the handler.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  handler: () => Promise<void>,
): Promise<{ processed: boolean }> {
  try {
    await prisma.processedStripeEvent.create({
      data: { stripeEventId: event.id, type: event.type },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { processed: false };
    }
    throw err;
  }
  await handler();
  return { processed: true };
}
