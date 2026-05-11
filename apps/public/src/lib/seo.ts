import { env } from "@/env";
import type { Metadata } from "next";

/**
 * Locale-aware canonical + hreflang helpers for public pages (PLAN §11.13).
 *
 * Conventions:
 *   - Canonical URL is `${BASE}/${currentLocale}${path}` — every locale
 *     gets its own canonical, never cross-locale.
 *   - hreflang alternates carry one entry per locale + an x-default
 *     pointing at /en (Google's recommendation when one locale is the
 *     "neutral" default).
 *   - `path` MUST start with "/" and MUST NOT include the locale prefix.
 *
 * Pass the resulting object as `alternates` on the Metadata object.
 */

export const LOCALES = ["en", "es", "de", "fr"] as const;
export type SeoLocale = (typeof LOCALES)[number];

const BASE_URL = env.NEXT_PUBLIC_PUBLIC_URL;

/**
 * Returns the same path for every locale (e.g. /search, /, /property/...id).
 * Use when the slug is the same across locales — most pages.
 */
export function localeAlternates(args: {
  currentLocale: string;
  path: string;
}): NonNullable<Metadata["alternates"]> {
  const { currentLocale, path } = args;
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[loc] = `${BASE_URL}/${loc}${path}`;
  }
  // Google: x-default is the canonical "no preference" target — point at en.
  languages["x-default"] = `${BASE_URL}/en${path}`;
  return {
    canonical: `${BASE_URL}/${currentLocale}${path}`,
    languages,
  };
}

/**
 * For pages where the URL slug differs by locale (property detail, location
 * landing). Caller supplies the per-locale path; we set canonical to the
 * current one and emit alternates for any locales the caller provided.
 *
 * Locales not present in `pathByLocale` are silently dropped — happens when
 * a property has no Spanish translation, etc.
 */
export function localeAlternatesByLocale(args: {
  currentLocale: string;
  pathByLocale: Partial<Record<SeoLocale, string>>;
}): NonNullable<Metadata["alternates"]> {
  const { currentLocale, pathByLocale } = args;
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    const p = pathByLocale[loc];
    if (p) languages[loc] = `${BASE_URL}/${loc}${p}`;
  }
  const enPath = pathByLocale.en ?? Object.values(pathByLocale)[0];
  if (enPath) languages["x-default"] = `${BASE_URL}/en${enPath}`;

  const canonicalPath =
    pathByLocale[currentLocale as SeoLocale] ?? pathByLocale.en ?? Object.values(pathByLocale)[0];
  return {
    canonical: canonicalPath ? `${BASE_URL}/${currentLocale}${canonicalPath}` : undefined,
    languages,
  };
}

/** Public base URL (no trailing slash) — re-exported for callers that build URLs themselves. */
export const PUBLIC_BASE_URL = BASE_URL;
