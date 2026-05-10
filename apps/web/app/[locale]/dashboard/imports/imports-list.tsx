"use client";

import type { feedConnectionSchemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteConnectionAction, toggleSyncAction } from "./actions";

type Props = { locale: string; initial: feedConnectionSchemas.FeedConnection[] };

export function ImportsList({ locale, initial }: Props) {
  const t = useTranslations("imports");
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle(id: string, next: boolean) {
    setError(null);
    start(async () => {
      const r = await toggleSyncAction(locale, id, next);
      if (r.ok) setItems((prev) => prev.map((i) => (i.id === id ? r.data : i)));
      else setError(r.error);
    });
  }

  function onDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setError(null);
    start(async () => {
      const r = await deleteConnectionAction(locale, id);
      if (r.ok) setItems((prev) => prev.filter((i) => i.id !== id));
      else setError(r.error);
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
        {t("emptyState")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {items.map((c) => (
        <article
          key={c.id}
          className="rounded-md border bg-background p-4 shadow-sm flex items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{c.kind}</span>
              <Link
                href={`/${locale}/dashboard/imports/${c.id}`}
                className="font-medium hover:underline truncate"
              >
                {c.feedUrl}
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("cron")}: <code className="font-mono">{c.cronSchedule}</code>
              {c.lastRunAt && (
                <>
                  {" · "}
                  {t("lastRun")}: {new Date(c.lastRunAt).toLocaleString(locale)}
                </>
              )}
              {c.lastError && <span className="ml-2 text-red-600">⚠ {t("hasError")}</span>}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={c.syncEnabled}
              onChange={(e) => onToggle(c.id, e.target.checked)}
              disabled={pending}
            />
            {t(c.syncEnabled ? "on" : "off")}
          </label>
          <button
            type="button"
            onClick={() => onDelete(c.id)}
            disabled={pending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {t("delete")}
          </button>
        </article>
      ))}
    </div>
  );
}
