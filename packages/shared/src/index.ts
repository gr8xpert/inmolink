/**
 * Shared types and Zod schemas used across web, public, api, and worker.
 *
 * Sprint 0 scaffold — module-specific schemas land in their respective sprints.
 */
export * from "./locales";
export * from "./permissions";
export * as propertySchemas from "./schemas/property";
export * as uploadSchemas from "./schemas/upload";

// Re-export Zod for callers
export { z } from "zod";
