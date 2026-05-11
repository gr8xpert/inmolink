import { z } from "zod";

/** Sprint 11. Exports — CSV + PDF brochure / portfolio (PLAN §11.11). */

export const exportKindSchema = z.enum(["CSV", "PDF_PROPERTY", "PDF_PORTFOLIO"]);
export type ExportKind = z.infer<typeof exportKindSchema>;

export const exportStatusSchema = z.enum(["QUEUED", "RUNNING", "SUCCESS", "FAILED"]);
export type ExportStatus = z.infer<typeof exportStatusSchema>;

// ---- Filters ----
// Either propertyIds (explicit selection) or filters (server-side resolution).
// Same filter shape as the dashboard property list so users can "export this view".
export const exportFiltersSchema = z.object({
  status: z.string().optional(),
  visibility: z.string().optional(),
  transactionType: z.string().optional(),
  propertyTypeId: z.string().optional(),
  locationId: z.string().optional(),
  q: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  minPriceCents: z.coerce.number().int().nonnegative().optional(),
  maxPriceCents: z.coerce.number().int().nonnegative().optional(),
});
export type ExportFilters = z.infer<typeof exportFiltersSchema>;

export const exportCreateSchema = z
  .object({
    kind: exportKindSchema,
    locale: z.string().min(2).max(5).default("en"),
    propertyIds: z.array(z.string().min(1)).max(500).optional(),
    filters: exportFiltersSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.propertyIds?.length) || Boolean(v.filters),
    "Provide either `propertyIds` or `filters`",
  )
  .refine(
    (v) => v.kind !== "PDF_PROPERTY" || v.propertyIds?.length === 1,
    "PDF_PROPERTY requires exactly one propertyId",
  );
export type ExportCreateInput = z.infer<typeof exportCreateSchema>;

// ---- Output ----
export const exportSchema = z.object({
  id: z.string(),
  kind: exportKindSchema,
  status: exportStatusSchema,
  locale: z.string(),
  filters: z.unknown().nullable(),
  propertyIds: z.unknown().nullable(),
  resultBytes: z.number().int().nullable(),
  expiresAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  requestedById: z.string(),
  requestedByName: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Export = z.infer<typeof exportSchema>;

export const exportListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  kind: exportKindSchema.optional(),
  status: exportStatusSchema.optional(),
});

export const exportListResponseSchema = z.object({
  items: z.array(exportSchema),
  nextCursor: z.string().nullable(),
});

// ---- BullMQ EXPORT_GENERATE job payload ----
export const exportGenerateJobSchema = z.object({
  exportId: z.string().min(1),
});
export type ExportGenerateJobData = z.infer<typeof exportGenerateJobSchema>;
