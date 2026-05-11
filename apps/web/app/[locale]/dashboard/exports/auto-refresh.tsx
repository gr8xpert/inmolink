"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Polls `router.refresh()` every 3s while there is at least one export still
 * being processed (`hasInflight`). Once everything settles to SUCCESS / FAILED
 * the interval is cleared and the page stops re-fetching. No visual output —
 * the parent Server Component re-renders with fresh data each tick.
 *
 * Sprint 11 follow-up — previous behaviour required the user to manually
 * refresh to see status flip from QUEUED → RUNNING → SUCCESS.
 */
export function ExportsAutoRefresh({ hasInflight }: { hasInflight: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasInflight) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [hasInflight, router]);
  return null;
}
