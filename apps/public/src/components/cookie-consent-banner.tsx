"use client";

import { useEffect, useState } from "react";
import { type ConsentChoice, readConsent, recordConsent } from "../lib/consent";

/**
 * Cookie consent banner.
 *
 * v1 stays minimal — we only ship strictly-necessary cookies, so the
 * banner offers Accept (records the choice) and Reject (records the
 * choice and confirms only strictly-necessary stays). The persistence + gate
 * checks live in `../lib/consent.ts`; any future analytics script must call
 * `hasAnalyticsConsent()` from there before loading (see #019).
 */
export function CookieConsentBanner({ locale }: { locale: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setVisible(true);
  }, []);

  function record(choice: ConsentChoice): void {
    recordConsent(choice);
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
