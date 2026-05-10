"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "inmolink-consent";
const STORAGE_KEY = "inmolink-consent";

/**
 * Cookie consent banner.
 *
 * v1 stays minimal — we only ship strictly-necessary cookies, so the
 * banner offers Accept (records the choice) and Reject (records the
 * choice and confirms only strictly-necessary stays). Both options write
 * the same cookie + localStorage flag because, today, both yield the
 * same runtime behaviour. When we add analytics/advertising the banner
 * can branch.
 */
export function CookieConsentBanner({ locale }: { locale: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // privacy mode disables localStorage; fall back to cookie probe
    }
    if (document.cookie.includes(`${COOKIE_NAME}=`)) return;
    setVisible(true);
  }, []);

  function record(choice: "accept" | "reject"): void {
    const oneYear = 365 * 24 * 60 * 60;
    document.cookie = `${COOKIE_NAME}=${choice}; path=/; max-age=${oneYear}; samesite=lax`;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignored
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          We use strictly necessary cookies (session + CSRF + your locale + this banner&apos;s
          choice). We do not run advertising or cross-site tracking. Read the full{" "}
          <a href={`/${locale}/cookies`} className="text-blue-700 underline hover:opacity-80">
            cookie policy
          </a>
          .
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => record("reject")}
            className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => record("accept")}
            className="rounded-md bg-foreground px-4 py-1.5 text-sm text-background hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </aside>
  );
}
