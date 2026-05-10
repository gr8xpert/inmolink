"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createViewingAction } from "./actions";

type Props = {
  locale: string;
  initialPropertyId?: string;
};

/**
 * Lean RHF-free form — handles 4 fields + a 1-3 preferredDates list.
 * The introducer must already know the propertyId from the marketplace
 * detail page (the "Request viewing" CTA there will land here with
 * ?propertyId=… prefilled in 6.I).
 */
export function ViewingRequestForm({ locale, initialPropertyId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [date1, setDate1] = useState("");
  const [date2, setDate2] = useState("");
  const [date3, setDate3] = useState("");
  const [duration, setDuration] = useState("60");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [introducerMessage, setIntroducerMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const dates = [date1, date2, date3]
      .filter((d) => d.trim().length > 0)
      .map((d) => new Date(d).toISOString());
    if (!propertyId.trim()) {
      setError("Property ID is required.");
      return;
    }
    if (dates.length === 0) {
      setError("Pick at least one preferred date.");
      return;
    }
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }

    start(async () => {
      const r = await createViewingAction(locale, {
        propertyId: propertyId.trim(),
        preferredDates: dates,
        durationMinutes: duration ? Number.parseInt(duration, 10) : undefined,
        meetingPoint: meetingPoint.trim() || undefined,
        introducerMessage: introducerMessage.trim() || undefined,
        client: {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      if (r.ok) router.push(`/${locale}/dashboard/viewings/${r.data.id}`);
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
        <h2 className="text-lg font-semibold">Listing</h2>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Property ID</span>
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="input mt-1 w-full font-mono"
            placeholder="cltm…"
            required
          />
        </label>
      </section>

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Preferred dates</h2>
        <p className="text-sm text-muted-foreground">
          Up to three slots. The listing agent will pick one when accepting.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[date1, date2, date3].map((d, i) => (
            <input
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order, 3 fixed slots
              key={i}
              type="datetime-local"
              value={d}
              onChange={(e) =>
                i === 0
                  ? setDate1(e.target.value)
                  : i === 1
                    ? setDate2(e.target.value)
                    : setDate3(e.target.value)
              }
              className="input"
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-muted-foreground">Duration (minutes)</span>
            <input
              type="number"
              min={15}
              max={240}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Meeting point</span>
            <input
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              className="input mt-1 w-full"
              placeholder="At the property"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Client (encrypted at rest)</h2>
        <p className="text-sm text-muted-foreground">
          Only you and the listing agent can see these details. AES-256-GCM encrypted at rest.
        </p>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1 w-full"
            required
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-muted-foreground">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="block text-muted-foreground">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input mt-1 w-full"
            rows={3}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Message to the listing agent</h2>
        <textarea
          value={introducerMessage}
          onChange={(e) => setIntroducerMessage(e.target.value)}
          className="input w-full"
          rows={3}
          placeholder="Anything they should know about the buyer or the visit?"
        />
      </section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
