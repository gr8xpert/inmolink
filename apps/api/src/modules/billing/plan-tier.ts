import { prisma } from "@inmolink/db";
import type { PaidFeature, PlanTier } from "@inmolink/shared";
import type { FastifyRequest } from "fastify";

const PRO_OR_HIGHER: ReadonlySet<PlanTier> = new Set<PlanTier>(["PRO", "BUSINESS", "ENTERPRISE"]);

export class PlanRequiredError extends Error {
  readonly statusCode = 403;
  readonly code = "PLAN_REQUIRED";
  constructor(public readonly requiredTier: PlanTier = "PRO") {
    super(`Paid plan required (${requiredTier})`);
    this.name = "PlanRequiredError";
  }
}

/**
 * Resolves the *effective* plan tier for an agency.
 *
 * Walks AgencySubscription:
 * - SUSPENDED / CANCELLED → falls back to FREE.
 * - Manual grant whose `grantedUntil` has passed → falls back to FREE.
 * - Active row whose `currentPeriodEnd` has passed (no webhook update yet) →
 *   we still trust the row but log; Stripe webhooks bring it back in sync.
 *
 * No row at all → FREE (the seed creates a row only when an agency upgrades;
 * the schema's `default(FREE)` matters when a row exists but Stripe state is
 * unknown).
 */
export async function getCurrentPlanTier(agencyId: string | null): Promise<PlanTier> {
  if (!agencyId) return "FREE";
  const sub = await prisma.agencySubscription.findUnique({
    where: { agencyId },
    select: {
      planTier: true,
      status: true,
      grantedManually: true,
      grantedUntil: true,
    },
  });
  if (!sub) return "FREE";

  // Manual grants override Stripe status. Reverted to FREE when the grant
  // lapses — the super-admin UI surfaces this so it can be extended.
  if (sub.grantedManually) {
    if (sub.grantedUntil && sub.grantedUntil.getTime() < Date.now()) return "FREE";
    return sub.planTier as PlanTier;
  }

  // Stripe-driven: paid only when subscription is in good standing.
  const goodStanding: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE"]);
  if (!goodStanding.has(sub.status)) return "FREE";
  return sub.planTier as PlanTier;
}

export function tierHasFeature(tier: PlanTier, feature: PaidFeature): boolean {
  // Today every paid feature in the matrix lives at PRO+. When a sub-tier
  // gets carved out (e.g. BUSINESS-only), encode the per-feature minimum
  // here; callers stay unchanged.
  if (feature.startsWith("feature:")) return PRO_OR_HIGHER.has(tier);
  return false;
}

/**
 * Throws PlanRequiredError if the request's user does not satisfy the
 * feature gate. SUPER_ADMIN bypasses (consistent with @inmolink/auth `can`).
 */
export async function requireFeature(
  request: FastifyRequest,
  feature: PaidFeature,
): Promise<PlanTier> {
  const user = request.requireUser();
  if (user.role === "SUPER_ADMIN") return "ENTERPRISE";
  const tier = await getCurrentPlanTier(user.agencyId);
  if (!tierHasFeature(tier, feature)) {
    throw new PlanRequiredError("PRO");
  }
  return tier;
}
