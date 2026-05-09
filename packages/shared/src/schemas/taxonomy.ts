import { z } from "zod";

/**
 * Read-side schemas for the property-type + location pickers used by the
 * dashboard create/edit forms. The full super-admin curation API lands in
 * Sprint 2; these are the minimal endpoints needed to ship slice F.2.
 *
 * Each item carries a single `name` resolved server-side from the requested
 * locale (falling back to en, then first available) so the dashboard
 * doesn't need to ship the full translations array down.
 */

const cuid = z.string().min(1);

export const propertyTypeListItemSchema = z.object({
  id: cuid,
  groupId: cuid,
  name: z.string(),
  iconName: z.string().nullable(),
  position: z.number().int(),
});

export const propertyTypeListResponseSchema = z.object({
  items: z.array(propertyTypeListItemSchema),
});

export const locationListItemSchema = z.object({
  id: cuid,
  parentId: cuid.nullable(),
  level: z.enum(["COUNTRY", "REGION", "CITY", "AREA"]),
  countryCode: z.string(),
  name: z.string(),
  position: z.number().int(),
});

export const locationListResponseSchema = z.object({
  items: z.array(locationListItemSchema),
});

export type PropertyTypeListItem = z.infer<typeof propertyTypeListItemSchema>;
export type LocationListItem = z.infer<typeof locationListItemSchema>;
