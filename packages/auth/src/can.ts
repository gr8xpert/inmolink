import {
  type PaidFeature,
  type PlanTier,
  type UserRole,
} from "@inmolink/shared";

/**
 * Permission predicate. Locked behavior:
 * - SUPER_ADMIN can do anything.
 * - AGENCY_ADMIN can do anything within their agency (caller filters by agencyId).
 * - AGENT can mutate only their own resources (caller filters by ownerUserId).
 * - Paid features (PaidFeature actions) require PRO tier or higher.
 *
 * PLAN §3 + §6.
 */
export type Subject = {
  role: UserRole;
  agencyId: string | null;
  planTier: PlanTier;
};

export type Action =
  | PaidFeature
  | `resource:${string}:${"read" | "create" | "update" | "delete"}`;

export type Resource = {
  ownerUserId?: string;
  ownerAgencyId?: string;
};

const PRO_OR_HIGHER: ReadonlySet<PlanTier> = new Set<PlanTier>([
  "PRO",
  "BUSINESS",
  "ENTERPRISE",
]);

export function can(subject: Subject, action: Action, resource?: Resource): boolean {
  // Super-admin bypass
  if (subject.role === "SUPER_ADMIN") return true;

  // Paid-feature gate
  if (action.startsWith("feature:")) {
    return PRO_OR_HIGHER.has(subject.planTier);
  }

  // Resource ACL — caller is responsible for passing ownerUserId / ownerAgencyId.
  // AGENCY_ADMIN: full access within their agency.
  // AGENT: own resources only.
  if (action.startsWith("resource:")) {
    const isWrite = action.endsWith(":create") ||
      action.endsWith(":update") ||
      action.endsWith(":delete");

    // Reads are open by default — visibility filtering happens at the query layer
    // (PLAN §3: "Property visibility filter applied in every read query").
    if (!isWrite) return true;

    if (subject.role === "AGENCY_ADMIN") {
      return Boolean(
        resource?.ownerAgencyId && subject.agencyId === resource.ownerAgencyId,
      );
    }

    if (subject.role === "AGENT") {
      // Caller must supply owner identifiers; missing = deny (fail closed).
      // Comparison done elsewhere (caller knows current userId).
      return false;
    }
  }

  return false;
}

/**
 * Helper for plan-tier middleware in Fastify routes:
 * throws PLAN_REQUIRED with `requiredTier` so the client can prompt to upgrade.
 */
export class PlanRequiredError extends Error {
  readonly code = "PLAN_REQUIRED" as const;
  constructor(public readonly requiredTier: PlanTier = "PRO") {
    super(`Paid plan required (${requiredTier})`);
    this.name = "PlanRequiredError";
  }
}
