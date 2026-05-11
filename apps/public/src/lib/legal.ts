import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Loader for the static legal HTML fragments at
 * `apps/public/content/legal/<locale>/<kind>.html`. The HTML is the BODY only
 * — pages wrap it in a header (title, last-updated banner) and `<main>` chrome
 * so styling stays consistent across locales.
 *
 * Lawyers and copy editors can rewrite the .html files directly; devs review
 * via PR. Translations live alongside their kind, so es/de/fr authors only
 * touch their own file.
 *
 * NO admin UI for editing. Approach A from the S12 design discussion —
 * content-as-code with locale-separated files.
 */

export type LegalKind = "privacy" | "terms" | "cookies";
const LOCALES = ["en", "es", "de", "fr"] as const;
export type LegalLocale = (typeof LOCALES)[number];

/** Bump this when the underlying copy gets a material rewrite. */
export const LEGAL_LAST_UPDATED = "2026-05-10";

const CONTENT_ROOT = path.join(process.cwd(), "content", "legal");

const cache = new Map<string, string>();

function isLegalLocale(l: string): l is LegalLocale {
  return (LOCALES as readonly string[]).includes(l);
}

export async function loadLegalHtml(locale: string, kind: LegalKind): Promise<string> {
  // Fall back to EN if the requested locale isn't one we support — keeps the
  // page renderable even when a router slip-up lands a weird `locale=…` here.
  const effective: LegalLocale = isLegalLocale(locale) ? locale : "en";
  const key = `${effective}:${kind}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const fp = path.join(CONTENT_ROOT, effective, `${kind}.html`);
  try {
    const html = await readFile(fp, "utf8");
    cache.set(key, html);
    return html;
  } catch (err) {
    // Locale-specific file missing → degrade to EN. If EN is missing too, the
    // user has bigger problems (the deploy is broken); surface that as-is.
    if (effective !== "en") {
      const fallback = await readFile(path.join(CONTENT_ROOT, "en", `${kind}.html`), "utf8");
      cache.set(key, fallback);
      return fallback;
    }
    throw err;
  }
}
