/**
 * Locale-aware formatters for the dashboard. Money is BigInt cents over
 * the wire (PLAN §10) — never float math on the client.
 */

const LOCALE_TAG: Record<string, string> = {
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
  fr: "fr-FR",
};

export function formatMoney(cents: number, currency: string, locale: string): string {
  const tag = LOCALE_TAG[locale] ?? "en-GB";
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(iso: string, locale: string): string {
  const tag = LOCALE_TAG[locale] ?? "en-GB";
  return new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
