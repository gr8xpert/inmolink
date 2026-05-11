/**
 * Cookie / analytics consent helper.
 *
 * Single source of truth for whether the visitor has accepted non-essential
 * cookies (analytics, ad pixels, etc.). The cookie-consent banner writes
 * either `accept` or `reject` to a cookie + localStorage flag; callers must
 * gate any non-essential script load behind `hasAnalyticsConsent()`.
 *
 * v1 ships no analytics, so this currently returns `false` for every
 * visitor — but extracting the helper now means the day someone wires up
 * `next/script` for gtag, GA, Posthog, etc., they can call this gate
 * instead of re-implementing the flag check (and forgetting to read it,
 * which would be a silent GDPR violation — see issue #019).
 *
 * Stays a `"use client"` import — it touches `document.cookie` /
 * `localStorage` and is meaningless on the server. SSR callers should
 * pessimistically assume no consent.
 */

const COOKIE_NAME = "inmolink-consent";
const STORAGE_KEY = "inmolink-consent";

export type ConsentChoice = "accept" | "reject";

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const ls = window.localStorage.getItem(STORAGE_KEY);
    if (ls === "accept" || ls === "reject") return ls;
  } catch {
    // privacy mode disables localStorage; fall through to cookie probe
  }
  const cookies = (typeof document !== "undefined" ? document.cookie : "").split(";");
  for (const raw of cookies) {
    const [name, value] = raw.trim().split("=");
    if (name === COOKIE_NAME) {
      if (value === "accept" || value === "reject") return value;
    }
  }
  return null;
}

/**
 * True iff the visitor has explicitly accepted non-essential cookies.
 * Returns false on the server and for visitors who haven't decided yet —
 * defaults are conservative on purpose.
 */
export function hasAnalyticsConsent(): boolean {
  return readConsent() === "accept";
}

export function recordConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  const oneYear = 365 * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${choice}; path=/; max-age=${oneYear}; samesite=lax`;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignored
  }
}
