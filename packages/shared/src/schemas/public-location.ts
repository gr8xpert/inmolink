import { z } from "zod";

/**
 * Public location-landing schemas — what anonymous browsers see at
 * `/[locale]/buy/<country>/<region?>/<city?>/<area?>` and the corresponding
 * group route `/[locale]/region/<group-slug>`. PLAN §11.13 / §8.
 *
 * Rendering surface:
 *   - Page H1 / meta from the location's translation in the requested locale
 *     (falling back to en, then any).
 *   - Breadcrumb structured data — chain from country down to the current
 *     level, locale-correct slugs.
 *   - Children list (next level down) for click-through navigation.
 *   - Featured properties — first page of ACTIVE+PUBLIC properties whose
 *     `locationId` is the current row OR any of its descendants. Cursor-
 *     paginated like the search list.
 *   - FAQ items (optional, super-admin curated) → FAQPage JSON-LD.
 */

const cuid = z.string().min(1);
const slug = z.string().min(1).max(120);
const localeStr = z.enum(["en", "es", "de", "fr"]);
const levelStr = z.enum(["COUNTRY", "REGION", "CITY", "AREA"]);

export const publicLocationBreadcrumbSchema = z.object({
  level: levelStr,
  name: z.string(),
  slug: slug,
  /** URL path *without* locale prefix — caller composes `/${locale}${path}`. */
  path: z.string(),
});

export const publicLocationChildSchema = z.object({
  id: cuid,
  level: levelStr,
  name: z.string(),
  slug: slug,
  /** Pre-computed canonical path for the child. */
  path: z.string(),
  /** Approximate property count under this child — drives ordering. */
  propertyCount: z.number().int().nonnegative(),
});

export const publicLocationFAQSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const publicLocationLandingSchema = z.object({
  id: cuid,
  level: levelStr,
  countryCode: z.string(),
  name: z.string(),
  slug: slug,
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  /** Canonical path *without* locale prefix. */
  path: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  breadcrumb: z.array(publicLocationBreadcrumbSchema),
  children: z.array(publicLocationChildSchema),
  faqs: z.array(publicLocationFAQSchema),
  /** Total ACTIVE+PUBLIC properties under this location (incl. descendants). */
  totalProperties: z.number().int().nonnegative(),
});

export const publicLocationLandingQuerySchema = z.object({
  /**
   * Up to 4 slug segments separated by `/`. Order is country → region →
   * city → area. The api resolves each segment by (locale, slug) — every
   * Location slug is unique within a locale (enforced by the unique
   * constraint on LocationTranslation) — and verifies parent chain.
   */
  path: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-z0-9-]+(\/[a-z0-9-]+){0,3}$/i, "path must be 1–4 slug segments"),
  locale: localeStr.default("en"),
});

export const publicLocationGroupLandingQuerySchema = z.object({
  slug,
  locale: localeStr.default("en"),
});

export const publicLocationGroupLandingSchema = z.object({
  id: cuid,
  name: z.string(),
  slug,
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  members: z.array(
    z.object({
      id: cuid,
      level: levelStr,
      name: z.string(),
      slug,
      path: z.string(),
      propertyCount: z.number().int().nonnegative(),
    }),
  ),
  totalProperties: z.number().int().nonnegative(),
});

export type PublicLocationLanding = z.infer<typeof publicLocationLandingSchema>;
export type PublicLocationGroupLanding = z.infer<typeof publicLocationGroupLandingSchema>;
export type PublicLocationBreadcrumb = z.infer<typeof publicLocationBreadcrumbSchema>;
export type PublicLocationChild = z.infer<typeof publicLocationChildSchema>;
export type PublicLocationFAQ = z.infer<typeof publicLocationFAQSchema>;
