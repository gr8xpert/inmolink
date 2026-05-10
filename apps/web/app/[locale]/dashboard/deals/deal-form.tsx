"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createDealAction } from "./actions";

type Props = {
  locale: string;
  initialViewingRequestId?: string;
};

export function DealForm({ locale, initialViewingRequestId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [viewingRequestId, setViewingRequestId] = useState(initialViewingRequestId ?? "");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [commissionPct, setCommissionPct] = useState("");
  const [introducerSharePct, setIntroducerSharePct] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const cents = Math.round(Number.parseFloat(agreedPrice || "0") * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Agreed price must be positive.");
      return;
    }
    start(async () => {
      const r = await createDealAction(locale, {
        viewingRequestId: viewingRequestId.trim(),
        agreedPriceCents: cents,
        currency: currency.trim().toUpperCase(),
        commissionPct: commissionPct ? Number.parseFloat(commissionPct) : undefined,
        introducerSharePct: introducerSharePct ? Number.parseFloat(introducerSharePct) : undefined,
        closingDate: closingDate || undefined,
        message: message.trim() || undefined,
      });
      if (r.ok) router.push(`/${locale}/dashboard/deals/${r.data.id}`);
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Source</h2>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Viewing request ID</span>
          <input
            value={viewingRequestId}
            onChange={(e) => setViewingRequestId(e.target.value)}
            className="input mt-1 w-full font-mono"
            required
          />
        </label>
      </section>

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Deal terms</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr,1fr]">
          <label className="block text-sm">
            <span className="block text-muted-foreground">Agreed price</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={agreedPrice}
              onChange={(e) => setAgreedPrice(e.target.value)}
              className="input mt-1 w-full"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input mt-1 w-full font-mono uppercase"
              maxLength={3}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-muted-foreground">
              Commission % <span className="text-xs">(default: agency setting)</span>
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className="input mt-1 w-full"
              placeholder="5.00"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">
              Introducer share % <span className="text-xs">(default: 50)</span>
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={introducerSharePct}
              onChange={(e) => setIntroducerSharePct(e.target.value)}
              className="input mt-1 w-full"
              placeholder="50.00"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Closing date (optional)</span>
          <input
            type="date"
            value={closingDate}
            onChange={(e) => setClosingDate(e.target.value)}
            className="input mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="input mt-1 w-full"
          />
        </label>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit deal"}
      </button>
    </form>
  );
}
