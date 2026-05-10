import { z } from "zod";

/**
 * Job payload + connection schemas shared between apps/api and apps/worker
 * (PLAN §11.5). The job payload is intentionally compact — heavy work
 * (decryption, lookup) happens inside the worker once it has the FeedConnection.
 */

export const feedConnectorKindSchema = z.enum(["KYERO", "RESALE_ONLINE", "GENERIC_XML"]);

export const feedRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export const feedRunTriggerSchema = z.enum(["CRON", "MANUAL", "RETRY"]);

export const feedImportJobSchema = z.object({
  feedConnectionId: z.string().min(1),
  /** Pre-created FeedRun for manual/retry triggers. CRON ticks omit this; the
   *  worker creates a FeedRun(QUEUED) row before locking the connection. */
  runId: z.string().min(1).optional(),
  triggeredBy: feedRunTriggerSchema,
});

export type FeedImportJobData = z.infer<typeof feedImportJobSchema>;

/** Lock keys agents can apply to individual property fields (PLAN row 16). */
export const lockableFieldSchema = z.enum([
  "price",
  "transactionType",
  "propertyTypeId",
  "locationId",
  "latitude",
  "longitude",
  "bedrooms",
  "bathrooms",
  "areaM2",
  "plotM2",
  "yearBuilt",
  "features",
  "translations",
  "images",
]);

export type LockableField = z.infer<typeof lockableFieldSchema>;

export const lockedFieldsSchema = z.array(lockableFieldSchema);

/** Field-mapping config persisted on FeedConnection.fieldMappings for
 *  GENERIC_XML connectors. Mirrors GenericXmlConfig from @inmolink/imports
 *  but typed for JSON serialisation. */
export const genericXmlConfigSchema = z.object({
  itemTag: z.string().min(1),
  countryCode: z.string().length(2).optional(),
  source: feedConnectorKindSchema,
  mappings: z.array(
    z.object({
      path: z.string().min(1),
      target: z.enum([
        "externalRef",
        "priceCents",
        "currency",
        "transactionType",
        "typeName",
        "townName",
        "provinceName",
        "countryCode",
        "latitude",
        "longitude",
        "addressLine",
        "postcode",
        "bedrooms",
        "bathrooms",
        "areaM2",
        "plotM2",
        "yearBuilt",
        "videoUrl",
        "virtualTourUrl",
        "sourceUpdatedAt",
        "title",
        "description",
        "feature",
        "imageUrl",
        "floorPlanUrl",
      ]),
      locale: z.enum(["en", "es", "de", "fr"]).optional(),
      localeFromAttr: z.string().optional(),
      transform: z
        .enum([
          "trim",
          "lower",
          "upper",
          "money",
          "isoDate",
          "stripParenSuffix",
          "freqToTx",
          "intRound",
        ])
        .optional(),
      default: z.string().optional(),
    }),
  ),
});

export type GenericXmlConfigJson = z.infer<typeof genericXmlConfigSchema>;
