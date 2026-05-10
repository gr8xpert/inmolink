/**
 * Shared types and Zod schemas used across web, public, api, and worker.
 *
 * Sprint 0 scaffold — module-specific schemas land in their respective sprints.
 */
export * from "./locales";
export * from "./permissions";
export * as adminFeatureSchemas from "./schemas/admin-features";
export * as adminLocationGroupSchemas from "./schemas/admin-location-groups";
export * as adminLocationSchemas from "./schemas/admin-locations";
export * as adminPropertyTypeSchemas from "./schemas/admin-property-types";
export * as mediaSchemas from "./schemas/media";
export * as propertyImageSchemas from "./schemas/property-images";
export * as propertySchemas from "./schemas/property";
export * as publicPropertySchemas from "./schemas/public-property";
export * as taxonomySchemas from "./schemas/taxonomy";
export * as uploadSchemas from "./schemas/upload";

// Re-export Zod for callers
export { z } from "zod";
