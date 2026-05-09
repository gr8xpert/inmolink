import { z } from "zod";

/** PLAN §4 — locales locked at v1. */
export const LOCALES = ["en", "es", "de", "fr"] as const;
export const DEFAULT_LOCALE = "en" as const;

export type Locale = (typeof LOCALES)[number];

export const localeSchema = z.enum(LOCALES);
