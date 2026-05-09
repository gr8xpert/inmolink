import { z } from "zod";

/** PLAN §3 — three-role model. */
export const USER_ROLES = ["SUPER_ADMIN", "AGENCY_ADMIN", "AGENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * PLAN §6 — paid features (gated behind PRO plan tier).
 * Add new gated features here; the `can()` helper in @inmolink/auth checks against this list.
 */
export const PAID_FEATURES = [
  "feature:visibility.public",
  "feature:export.csv",
  "feature:export.pdf",
  "feature:marketing.campaigns",
  "feature:marketing.templates",
  "feature:marketing.suppressions",
  "feature:marketing.smtp",
  "feature:marketing.customDomain",
  "feature:featured.listings",
] as const;
export type PaidFeature = (typeof PAID_FEATURES)[number];

/** Plan tiers. PLAN §6: FREE / PRO active in v1; BUSINESS / ENTERPRISE reserved. */
export const PLAN_TIERS = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const planTierSchema = z.enum(PLAN_TIERS);
