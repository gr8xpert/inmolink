"use client";

import { type FormEvent, useState } from "react";

/**
 * Anonymous lead form on the public property detail page (PLAN §11.4).
 *
 * Client Component — Server Action would have been cleaner but the form
 * lives on an ISR-cached Server Component page; submitting via fetch keeps
 * the static HTML cacheable. The post target is the api directly; we don't
 * proxy through Next.js (no cookie forwarding needed — anonymous).
 *
 * Honeypot field `companyName` is kept out of the visual flow via inline
 * CSS rather than a tailwind utility — easier to be sure across themes.
 */

type Props = {
  propertyId: string;
  locale: string;
  /** Localized form labels. Server passes them in so we don't pull next-intl into a client component. */
  labels: {
    contactAgency: string;
    name: string;
    email: string;
    phone: string;
    eitherEmailOrPhone: string;
    message: string;
    submit: string;
    submitting: string;
    success: string;
    error: string;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ContactAgencyForm({ propertyId, locale, labels }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    { kind: "ok"; ref: string } | { kind: "error"; message: string } | null
  >(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = {
      source: "PROPERTY_DETAIL" as const,
      propertyId,
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      message: String(fd.get("message") ?? ""),
      companyName: String(fd.get("companyName") ?? ""),
      locale,
    };

    try {
      const res = await fetch(`${API_BASE}/api/public/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = (await res.json().catch(() => null)) as { message?: string } | null;
        setResult({
          kind: "error",
          message: text?.message ?? labels.error,
        });
        return;
      }
      const data = (await res.json()) as { ref: string };
      setResult({ kind: "ok", ref: data.ref });
      form.reset();
    } catch {
      setResult({ kind: "error", message: labels.error });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === "ok") {
    return (
      <div className="rounded-md border bg-green-50 p-4 text-sm text-green-900">
        {labels.success} <span className="font-mono">#{result.ref}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border bg-background p-4">
      <h2 className="text-lg font-semibold">{labels.contactAgency}</h2>

      {/* Honeypot — hidden from humans, harvested by bots. */}
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          height: 0,
          width: 0,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label htmlFor="companyName">Company</label>
        <input id="companyName" name="companyName" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block text-muted-foreground">{labels.name} *</span>
          <input name="name" required minLength={2} maxLength={80} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm">
          <span className="block text-muted-foreground">{labels.email}</span>
          <input
            name="email"
            type="email"
            maxLength={254}
            className="input mt-1 w-full"
            placeholder="you@example.com"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-muted-foreground">{labels.phone}</span>
          <input
            name="phone"
            type="tel"
            maxLength={40}
            className="input mt-1 w-full"
            placeholder="+34 …"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{labels.eitherEmailOrPhone}</p>

      <label className="block text-sm">
        <span className="block text-muted-foreground">{labels.message} *</span>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          className="input mt-1 w-full"
        />
      </label>

      {result?.kind === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
