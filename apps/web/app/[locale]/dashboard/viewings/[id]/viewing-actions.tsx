"use client";

import type { viewingRequestSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptViewingAction,
  cancelViewingAction,
  declineViewingAction,
  rescheduleViewingAction,
  setOutcomeAction,
} from "../actions";

type Props = {
  locale: string;
  viewing: viewingRequestSchemas.ViewingRequest;
  isOwner: boolean;
};

const OUTCOMES = ["NO_INTEREST", "INTERESTED", "OFFER_MADE", "SOLD", "RENTED"] as const;

export function ViewingActions({ locale, viewing, isOwner }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "accept" | "decline" | "reschedule" | "outcome">(null);

  // Accept / reschedule shared inputs
  const firstSlot = viewing.preferredDates[0] ?? new Date().toISOString();
  const [scheduledAt, setScheduledAt] = useState(firstSlot.slice(0, 16));
  const [meetingPoint, setMeetingPoint] = useState(viewing.meetingPoint ?? "");
  const [responseMessage, setResponseMessage] = useState("");
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("NO_INTEREST");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  const a = viewing.callerActions;
  const anyAction =
    a.canAccept ||
    a.canDecline ||
    a.canReschedule ||
    a.canCancel ||
    a.canSetOutcome ||
    a.canSubmitDeal;

  function refresh() {
    router.refresh();
  }

  function onAccept() {
    setError(null);
    start(async () => {
      const r = await acceptViewingAction(locale, viewing.id, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        meetingPoint: meetingPoint.trim() || undefined,
        responseMessage: responseMessage.trim() || undefined,
      });
      if (r.ok) {
        setPanel(null);
        refresh();
      } else setError(r.error);
    });
  }

  function onDecline() {
    setError(null);
    start(async () => {
      const r = await declineViewingAction(locale, viewing.id, {
        responseMessage: responseMessage.trim() || undefined,
      });
      if (r.ok) {
        setPanel(null);
        refresh();
      } else setError(r.error);
    });
  }

  function onReschedule() {
    setError(null);
    start(async () => {
      const r = await rescheduleViewingAction(locale, viewing.id, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        meetingPoint: meetingPoint.trim() || undefined,
        responseMessage: responseMessage.trim() || undefined,
      });
      if (r.ok) {
        setPanel(null);
        refresh();
      } else setError(r.error);
    });
  }

  function onCancel() {
    if (!confirm("Cancel this viewing? The other party will be notified.")) return;
    setError(null);
    start(async () => {
      const r = await cancelViewingAction(locale, viewing.id);
      if (r.ok) refresh();
      else setError(r.error);
    });
  }

  function onSetOutcome() {
    setError(null);
    start(async () => {
      const r = await setOutcomeAction(locale, viewing.id, {
        outcome,
        notes: outcomeNotes.trim() || undefined,
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
        No actions available — this request is in a terminal state.
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
        {a.canAccept && (
          <button
            type="button"
            onClick={() => setPanel("accept")}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Accept
          </button>
        )}
        {a.canDecline && (
          <button
            type="button"
            onClick={() => setPanel("decline")}
            disabled={pending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Decline
          </button>
        )}
        {a.canReschedule && (
          <button
            type="button"
            onClick={() => setPanel("reschedule")}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Reschedule
          </button>
        )}
        {a.canSetOutcome && (
          <button
            type="button"
            onClick={() => setPanel("outcome")}
            disabled={pending}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Set outcome
          </button>
        )}
        {a.canSubmitDeal && (
          <a
            href={`/${locale}/dashboard/deals/new?viewingRequestId=${viewing.id}`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            Submit deal
          </a>
        )}
        {a.canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel viewing
          </button>
        )}
      </div>

      {(panel === "accept" || panel === "reschedule") && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">
            {panel === "accept" ? "Confirm slot" : "Propose new slot"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="block text-muted-foreground">Scheduled at</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-muted-foreground">Meeting point</span>
              <input
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                className="input mt-1 w-full"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Message (optional)</span>
            <textarea
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              rows={2}
              className="input mt-1 w-full"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={panel === "accept" ? onAccept : onReschedule}
              disabled={pending}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : panel === "accept" ? "Confirm accept" : "Confirm reschedule"}
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

      {panel === "decline" && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Decline reason (optional)</h3>
          <textarea
            value={responseMessage}
            onChange={(e) => setResponseMessage(e.target.value)}
            rows={3}
            className="input w-full"
            placeholder="Optional message back to the introducer."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={pending}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : "Confirm decline"}
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

      {panel === "outcome" && isOwner && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="font-medium">Record outcome</h3>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as (typeof OUTCOMES)[number])}
            className="input w-full"
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <textarea
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            rows={3}
            className="input w-full"
            placeholder="Optional notes (visible to the introducer)."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSetOutcome}
              disabled={pending}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : "Save outcome"}
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
