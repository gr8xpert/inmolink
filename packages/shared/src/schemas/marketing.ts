import { z } from "zod";

/**
 * Marketing schemas — Sprint 8.
 * Email config + domains + templates + campaigns + suppressions + contacts +
 * featured listings.
 */

// ---- AgencyEmailConfig ----

export const emailConfigInputSchema = z.object({
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1).max(255),
  smtpPassword: z.string().min(1).max(1024).optional(), // omit on update to keep existing
  smtpSecure: z.boolean().default(false),
  fromEmail: z.string().email(),
  fromName: z.string().min(1).max(255),
  dkimDomain: z.string().max(255).optional().nullable(),
  dkimSelector: z.string().max(63).optional().nullable(),
  dkimPrivateKey: z.string().max(8192).optional().nullable(),
});
export type EmailConfigInput = z.infer<typeof emailConfigInputSchema>;

export const emailConfigSchema = z.object({
  agencyId: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int(),
  smtpUser: z.string(),
  smtpSecure: z.boolean(),
  fromEmail: z.string(),
  fromName: z.string(),
  hasPassword: z.boolean(),
  hasDkimKey: z.boolean(),
  dkimDomain: z.string().nullable(),
  dkimSelector: z.string().nullable(),
  testStatus: z.string().nullable(),
  testedAt: z.string().nullable(),
});
export type EmailConfigOutput = z.infer<typeof emailConfigSchema>;

export const emailConfigTestSendInputSchema = z.object({
  to: z.string().email().optional(),
});

// ---- AgencyEmailDomain ----

export const emailDomainInputSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain"),
});
export type EmailDomainInput = z.infer<typeof emailDomainInputSchema>;

export const emailDomainStatusSchema = z.enum(["PENDING", "VERIFIED", "FAILED"]);
export type EmailDomainStatus = z.infer<typeof emailDomainStatusSchema>;

export const emailDomainRecordSchema = z.object({
  kind: z.enum(["TXT", "CNAME"]),
  host: z.string(),
  value: z.string(),
  purpose: z.enum(["VERIFY", "SPF", "DKIM", "DMARC"]),
});
export type EmailDomainRecord = z.infer<typeof emailDomainRecordSchema>;

export const emailDomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  verifiedAt: z.string().nullable(),
  verificationToken: z.string(),
  spfStatus: emailDomainStatusSchema,
  dkimStatus: emailDomainStatusSchema,
  dmarcStatus: emailDomainStatusSchema.nullable(),
  records: z.array(emailDomainRecordSchema),
  createdAt: z.string().optional(),
});
export type EmailDomain = z.infer<typeof emailDomainSchema>;

// ---- EmailTemplate ----

export const emailTemplateInputSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1).max(200_000),
  bodyText: z.string().max(200_000).optional().nullable(),
});
export type EmailTemplateInput = z.infer<typeof emailTemplateInputSchema>;

export const emailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;

export const emailTemplatePreviewInputSchema = z.object({
  bodyHtml: z.string().max(200_000),
  subject: z.string().max(255),
  contactId: z.string().optional(),
});
export const emailTemplatePreviewResponseSchema = z.object({
  subject: z.string(),
  bodyHtml: z.string(),
  context: z.record(z.unknown()),
});

// ---- EmailCampaign ----

export const recipientFilterSchema = z.object({
  source: z.enum(["contacts", "leads"]).default("contacts"),
  tags: z.array(z.string().min(1).max(64)).max(16).optional(),
  // When source=leads, optionally restrict to leads on a specific property
  propertyId: z.string().optional(),
});
export type RecipientFilter = z.infer<typeof recipientFilterSchema>;

export const campaignStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "PAUSED",
  "CANCELLED",
  "FAILED",
]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const campaignInputSchema = z.object({
  templateId: z.string().optional().nullable(),
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1).max(200_000),
  bodyText: z.string().max(200_000).optional().nullable(),
  recipientFilter: recipientFilterSchema.optional().nullable(),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  templateId: z.string().nullable(),
  name: z.string(),
  subject: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().nullable(),
  recipientFilter: z.unknown().nullable(),
  recipientCount: z.number().int(),
  scheduledFor: z.string().nullable(),
  status: campaignStatusSchema,
  sentCount: z.number().int(),
  deliveredCount: z.number().int(),
  openedCount: z.number().int(),
  clickedCount: z.number().int(),
  bouncedCount: z.number().int(),
  unsubscribedCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const campaignScheduleInputSchema = z.object({
  scheduledFor: z.string().datetime(),
});

export const campaignListResponseSchema = z.object({
  items: z.array(campaignSchema),
  nextCursor: z.string().nullable(),
});

// ---- EmailSuppression ----

export const suppressionReasonSchema = z.enum(["BOUNCE", "UNSUBSCRIBE", "COMPLAINT", "MANUAL"]);
export type SuppressionReason = z.infer<typeof suppressionReasonSchema>;

export const suppressionInputSchema = z.object({
  email: z.string().email(),
  reason: suppressionReasonSchema.default("MANUAL"),
  notes: z.string().max(1000).optional().nullable(),
});
export type SuppressionInput = z.infer<typeof suppressionInputSchema>;

export const suppressionSchema = z.object({
  id: z.string(),
  email: z.string(),
  reason: suppressionReasonSchema,
  bounceType: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const suppressionListResponseSchema = z.object({
  items: z.array(suppressionSchema),
  nextCursor: z.string().nullable(),
});

// ---- Contact ----

export const contactInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  tags: z.array(z.string().min(1).max(64)).max(16).optional().default([]),
  source: z.enum(["LEAD", "MANUAL", "CSV"]).default("MANUAL"),
  notes: z.string().max(2000).optional().nullable(),
  consentGiven: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  tags: z.array(z.string()),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  consentGivenAt: z.string().nullable(),
  unsubscribedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contactListResponseSchema = z.object({
  items: z.array(contactSchema),
  nextCursor: z.string().nullable(),
});

export const contactBulkInputSchema = z.object({
  contacts: z.array(contactInputSchema).min(1).max(1000),
});

// ---- FeaturedListing ----

export const featuredSurfaceSchema = z.enum([
  "PUBLIC_HOME",
  "LOCATION_PAGE",
  "SEARCH_TOP",
  "AGENCY_PROFILE_TOP",
]);
export type FeaturedSurface = z.infer<typeof featuredSurfaceSchema>;

export const featuredSourceSchema = z.enum(["PLAN_INCLUDED", "PAID_BOOST"]);

export const featuredListingInputSchema = z.object({
  propertyId: z.string(),
  surface: featuredSurfaceSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  position: z.number().int().min(0).default(0),
  source: featuredSourceSchema.default("PLAN_INCLUDED"),
});
export type FeaturedListingInput = z.infer<typeof featuredListingInputSchema>;

export const featuredListingSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  agencyId: z.string(),
  agencyName: z.string(),
  propertyTitle: z.string().nullable(),
  surface: featuredSurfaceSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  position: z.number().int(),
  source: z.string(),
  createdAt: z.string(),
});
export type FeaturedListing = z.infer<typeof featuredListingSchema>;

export const featuredListingListResponseSchema = z.object({
  items: z.array(featuredListingSchema),
  nextCursor: z.string().nullable(),
});

// ---- Public homepage featured rendering ----
export const publicFeaturedPropertyCardSchema = z.object({
  propertyId: z.string(),
  slug: z.string(),
  title: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
  transactionType: z.string(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  areaM2: z.number().int().nullable(),
  coverImageHash: z.string().nullable(),
  agencyName: z.string(),
  agencySlug: z.string(),
  agencyLogoR2Key: z.string().nullable(),
});
export type PublicFeaturedPropertyCard = z.infer<typeof publicFeaturedPropertyCardSchema>;
export const publicFeaturedListResponseSchema = z.object({
  items: z.array(publicFeaturedPropertyCardSchema),
});

// ---- BullMQ EMAIL_SEND job payload ----
export const emailSendJobSchema = z.object({
  recipientId: z.string().min(1),
});
export type EmailSendJobData = z.infer<typeof emailSendJobSchema>;
