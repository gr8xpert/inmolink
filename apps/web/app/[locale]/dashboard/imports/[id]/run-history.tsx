"use client";

import type { feedConnectionSchemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { triggerRunAction } from "../actions";

type Props = {
  locale: string;
  connectionId: string;
  runs: feedConnectionSchemas.FeedRun[];
};

const STATUS_COLORS: Record<feedConnectionSchemas.FeedRun["status"], string> = {
  QUEUED: "bg-yellow-100 text-yellow-900",
  RUNNING: "bg-blue-100 text-blue-900",
  SUCCESS: "bg-green-100 text-green-900",
  PARTIAL: "bg-orange-100 text-orange-900",
  FAILED: "bg-red-100 text-red-900",
  CANCELLED: "bg-gray-100 text-gray-900",
};

export function RunHistory({ locale, connectionId, runs }: Props) {
  const t = useTranslations("imports");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onRun() {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await triggerRunAction(locale, connectionId);
      if (r.ok) setInfo(`${t("queuedRun")} (#${r.data.runId.slice(-6)})`);
      else setError(r.error);
    });
  }

  return (
    <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("runHistory.title")}</h2>
        <button
          type="button"
          onClick={onRun}
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("queuingRun") : t("runNow")}
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {info && <p className="rounded-md bg-green-50 p-3 text-sm text-green-900">{info}</p>}

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("runHistory.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-md border bg-muted/20 p-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-mono ${STATUS_COLORS[r.status]}`}
                >
                  {r.status}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{r.triggeredBy}</span>
                <span className="text-muted-foreground">
                  {new Date(r.startedAt).toLocaleString(locale)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {t("runHistory.counts", {
                  total: r.itemsTotal,
                  created: r.itemsCreated,
                  updated: r.itemsUpdated,
                  skipped: r.itemsSkippedLocked,
                  failed: r.itemsFailed,
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
