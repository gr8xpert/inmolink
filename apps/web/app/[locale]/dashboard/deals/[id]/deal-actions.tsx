"use client";

import type { dealSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelDealAction,
  confirmDealAction,
  disputeDealAction,
  resolveDisputeAction,
} from "../actions";

type Props = {
  locale: string;
  deal: dealSchemas.Deal;
  isSuperAdmin: boolean;
};

export function DealActions({ locale, deal, isSuperAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "dispute" | "resolve">(null);
  const [reason, setReason] = useState("");
  const [resolveOutcome, setResolveOutcome] = useState<"CONFIRMED" | "CANCELLED">("CONFIRMED");
  const [resolveNotes, setResolveNotes] = useState("");

  const a = deal.callerActions;
  const anyAction = a.canConfirm || a.canDispute || a.canCancel || a.canResolveDispute;

  function refresh() {
    router.refresh();
  }

  function onConfirm() {
    setError(null);
    start(async () => {
      const r = await confirmDealAction(locale, deal.id, {});
      if (r.ok) refresh();
      else setError(r.error);
    });
  }

  function onCancelDeal() {
    if (!confirm("Cancel this deal? The other party will be notified.")) return;
    setError(null);
    start(async () => {
      const r = await cancelDealAction(locale, deal.id);
      if (r.ok) refresh();
      else setError(r.error);
    });
  }

  function onDispute() {
    if (reason.trim().length < 10) {
      setError("Provide at least 10 characters of context.");
      return;
    }
    setError(null);
    start(async () => {
      const r = await disputeDealAction(locale, deal.id, { reason: reason.trim() });
      if (r.ok) {
        setPanel(null);
        refresh();
      } else setError(r.error);
    });
  }

  function onResolve() {
    if (resolveNotes.trim().length < 5) {
      setError("Add a short note about your resolution.");
      return;
    }
    setError(null);
    start(async () => {
      const r = await resolveDisputeAction(locale, deal.id, {
        outcome: resolveOutcome,
        notes: resolveNotes.trim(),
      });
      if (r.ok) {
        setPanel(null);
        refresh();
      } else setError(r.error);
    });
  }

  if (!anyAction) {
    return (
      <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
        No actions available — this deal is in a terminal state for you.
      </p>
    );
  }

  return (
    <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Actions</h2>
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {a.canConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirm
          </button>
        )}
        {a.canDispute && (
          <button
            type="button"
            onClick={() => setPanel("dispute")}
            disabled={pending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Open dispute
          </button>
        )}
        {a.canCancel && (
          <button
            type="button"
            onClick={onCancelDeal}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel deal
          </button>
        )}
        {a.canResolveDispute && isSuperAdmin && (
          <button
            type="button"
            onClick={() => setPanel("resolve")}
            disabled={pending}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Resolve dispute
          </button>
        )}
      </div>

      {panel === "dispute" && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Why are you opening a dispute?</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="input w-full"
            placeholder="Explain — visible to the other party and to super-admin."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDispute}
              disabled={pending}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : "Open dispute"}
            </button>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === "resolve" && isSuperAdmin && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Resolve dispute (super-admin)</h3>
          <select
            value={resolveOutcome}
            onChange={(e) => setResolveOutcome(e.target.value as "CONFIRMED" | "CANCELLED")}
            className="input w-full"
          >
            <option value="CONFIRMED">Mark CONFIRMED — accept the snapshot</option>
            <option value="CANCELLED">Mark CANCELLED — discard the deal</option>
          </select>
          <textarea
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            rows={3}
            className="input w-full"
            placeholder="Resolution notes — surfaced to both parties + audit log."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onResolve}
              disabled={pending}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : "Save resolution"}
            </button>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
