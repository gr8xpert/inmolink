"use client";

import { useState, useTransition } from "react";
import { regenerateSitemapAction } from "./actions";

export function SitemapRegenerateButton({ locale }: { locale: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await regenerateSitemapAction(locale);
      if (res.ok) {
        setMsg(`Queued (job ${res.jobId.slice(0, 8)}…)`);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Queuing…" : "Regenerate sitemap now"}
      </button>
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
