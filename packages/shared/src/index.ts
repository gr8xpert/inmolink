/**
 * Shared types and Zod schemas used across web, public, api, and worker.
 *
 * Sprint 0 scaffold — module-specific schemas land in their respective sprints.
 */
export * from "./locales";
export * from "./permissions";
export * as adminFeatureSchemas from "./schemas/admin-features";
export * as adminFeedTypeMapSchemas from "./schemas/admin-feed-type-maps";
export * as feedConnectionSchemas from "./schemas/feed-connection";
export * as feedImportSchemas from "./schemas/feed-import";
export * as adminLocationGroupSchemas from "./schemas/admin-location-groups";
export * as adminLocationSchemas from "./schemas/admin-locations";
export * as adminPropertyTypeSchemas from "./schemas/admin-property-types";
export * as agencySchemas from "./schemas/agency";
export * as auditSchemas from "./schemas/audit";
export * as billingSchemas from "./schemas/billing";
export * as chatSchemas from "./schemas/chat";
export * as dealSchemas from "./schemas/deal";
export * as inviteSchemas from "./schemas/invite";
export * as leadSchemas from "./schemas/lead";
export * as marketingSchemas from "./schemas/marketing";
export * as meSchemas from "./schemas/me";
export * as mediaSchemas from "./schemas/media";
export * as notificationSchemas from "./schemas/notification";
export * as outboxSchemas from "./schemas/outbox";
export * as propertyImageSchemas from "./schemas/property-images";
export * as publicLocationSchemas from "./schemas/public-location";
export * as publicProfileSchemas from "./schemas/public-profile";
export * as propertySchemas from "./schemas/property";
export * as publicPropertySchemas from "./schemas/public-property";
export * as taxonomySchemas from "./schemas/taxonomy";
export * as ticketSchemas from "./schemas/ticket";
export * as webhookSchemas from "./schemas/webhook";
export * as twoFactorSchemas from "./schemas/two-factor";
export * as uploadSchemas from "./schemas/upload";
export * as viewingRequestSchemas from "./schemas/viewing-request";

// Re-export Zod for callers
export { z } from "zod";
