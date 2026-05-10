import { z } from "zod";

/**
 * Anonymous lead-capture schemas. Used by the public marketplace contact
 * form on property detail / agency / agent / location pages (PLAN §11.4
 * row 27 — "anonymous lead form").
 *
 * Validation conventions:
 *  - Name: required, 2–80 chars (post-trim).
 *  - One of email|phone is required: enforced via `.refine` on the create
 *    object — either field can carry the contact channel.
 *  - Message: required, 10–2000 chars to filter empty / spam submissions.
 *  - Honeypot: hidden field `companyName` MUST stay empty. Bots fill every
 *    visible-looking input; humans never see it (CSS-hidden in the form).
 *  - Locale: drives the language of the future notification email.
 */

const trimmedString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(max));

const emptyToUndef = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

export const SOURCE_VALUES = [
  "PROPERTY_DETAIL",
  "AGENCY_PAGE",
  "AGENT_PAGE",
  "LOCATION_LANDING",
  "OTHER",
] as const;

export const leadCreateSchema = z
  .object({
    source: z.enum(SOURCE_VALUES).default("PROPERTY_DETAIL"),
    /** When source=PROPERTY_DETAIL this is required; api re-checks. */
    propertyId: emptyToUndef,
    /** When source=AGENCY_PAGE / AGENT_PAGE this is set. */
    agencyId: emptyToUndef,
    name: trimmedString(80),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email().max(254).optional(),
    ),
    phone: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      // Permissive — international formats vary. Strip spaces / dashes
      // for storage; api owns canonicalisation if we need it later.
      z
        .string()
        .min(5)
        .max(40)
        .regex(/^[+0-9 \-()]+$/)
        .optional(),
    ),
    message: trimmedString(2000).pipe(z.string().min(10)),
    locale: z.enum(["en", "es", "de", "fr"]).default("en"),
    /** Honeypot — bots fill it, humans never see it. */
    companyName: z.string().max(200).optional(),
    /** Turnstile token — verified server-side in Sprint 4 (PLAN §9.3). */
    turnstileToken: z.string().optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: "Provide an email address or a phone number.",
    path: ["email"],
  });

export const leadCreateResponseSchema = z.object({
  ok: z.literal(true),
  /** Server returns an opaque acknowledgement id; clients show "we received your enquiry, ref #ABCD". */
  ref: z.string(),
});

export type LeadCreateInput = z.input<typeof leadCreateSchema>;
export type LeadCreateValidated = z.output<typeof leadCreateSchema>;
