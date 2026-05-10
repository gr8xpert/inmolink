import { z } from "zod";
import { planTierSchema } from "../permissions";

/** PLAN §11.7. Currencies offered to checkout — extend as new prices land. */
export const billingCurrencySchema = z.enum(["EUR", "GBP"]);
export type BillingCurrency = z.infer<typeof billingCurrencySchema>;

export const billingCycleSchema = z.enum(["MONTHLY", "YEARLY"]);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const subscriptionStatusSchema = z.enum([
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "INCOMPLETE",
  "UNPAID",
  "PAUSED",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const billingSummarySchema = z.object({
  agencyId: z.string(),
  planTier: planTierSchema,
  status: subscriptionStatusSchema,
  billingCycle: billingCycleSchema.nullable(),
  currency: billingCurrencySchema.nullable(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  cancelledAt: z.string().nullable(),
  grantedManually: z.boolean(),
  grantedUntil: z.string().nullable(),
  grantedReason: z.string().nullable(),
  // Indicates whether STRIPE_SECRET_KEY is configured server-side.
  // When false, dashboard hides upgrade buttons and shows a banner.
  billingEnabled: z.boolean(),
  hasStripeCustomer: z.boolean(),
  vatNumber: z.string().nullable(),
  vatCountryCode: z.string().nullable(),
  taxIdValidated: z.boolean(),
  billingEmail: z.string().nullable(),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

export const subscriptionInvoiceSchema = z.object({
  id: z.string(),
  stripeInvoiceId: z.string(),
  amountCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string(),
  status: z.string(),
  paidAt: z.string().nullable(),
  invoicePdfUrl: z.string().nullable(),
  hostedInvoiceUrl: z.string().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
  createdAt: z.string(),
});
export type SubscriptionInvoice = z.infer<typeof subscriptionInvoiceSchema>;

export const checkoutCreateSchema = z.object({
  cycle: billingCycleSchema,
  currency: billingCurrencySchema,
  // Optional override; defaults to dashboard /billing
  successPath: z.string().startsWith("/").optional(),
  cancelPath: z.string().startsWith("/").optional(),
});
export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;

export const checkoutCreateResponseSchema = z.object({ url: z.string().url() });

export const portalCreateSchema = z.object({
  returnPath: z.string().startsWith("/").optional(),
});
export type PortalCreateInput = z.infer<typeof portalCreateSchema>;

export const portalCreateResponseSchema = z.object({ url: z.string().url() });

export const billingDetailsSchema = z.object({
  billingEmail: z.string().email().nullable(),
  vatNumber: z
    .string()
    .trim()
    .regex(/^[A-Z0-9\- ]{4,32}$/i, "Invalid VAT format")
    .nullable(),
  vatCountryCode: z.string().trim().length(2).toUpperCase().nullable(),
});
export type BillingDetailsInput = z.infer<typeof billingDetailsSchema>;

// ---- Super-admin manual grant ----
export const manualGrantInputSchema = z.object({
  agencyId: z.string(),
  planTier: planTierSchema,
  // ISO date; null/undefined = open-ended
  grantedUntil: z.string().datetime().nullable().optional(),
  grantedReason: z.string().min(1).max(500),
});
export type ManualGrantInput = z.infer<typeof manualGrantInputSchema>;

export const manualGrantRevokeSchema = z.object({
  agencyId: z.string(),
  reason: z.string().max(500).optional(),
});
export type ManualGrantRevokeInput = z.infer<typeof manualGrantRevokeSchema>;

export const adminBillingAgencyRowSchema = z.object({
  agencyId: z.string(),
  agencyName: z.string(),
  agencySlug: z.string(),
  planTier: planTierSchema,
  status: subscriptionStatusSchema,
  grantedManually: z.boolean(),
  grantedUntil: z.string().nullable(),
  grantedReason: z.string().nullable(),
  billingEmail: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
});
export type AdminBillingAgencyRow = z.infer<typeof adminBillingAgencyRowSchema>;

export const adminBillingListResponseSchema = z.object({
  items: z.array(adminBillingAgencyRowSchema),
  nextCursor: z.string().nullable(),
});
