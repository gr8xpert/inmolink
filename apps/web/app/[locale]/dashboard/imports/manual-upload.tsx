"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Kind = "KYERO" | "RESALE_ONLINE" | "GENERIC_XML";

/**
 * One-off manual XML upload (PLAN §11.5). Posts the file directly to the
 * api with `credentials: "include"` so the Auth.js cookie is forwarded —
 * no need to round-trip through a Server Action just to relay multipart
 * bytes. The api creates a transient FeedConnection (syncEnabled=false)
 * and queues a manual run; the response carries the connectionId so we
 * can navigate to its run-history page on success.
 */
export function ManualUpload({ locale }: { locale: string }) {
  const t = useTranslations("imports.upload");
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("KYERO");
  const [fieldMappings, setFieldMappings] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError(t("fileRequired"));
      return;
    }
    if (kind === "GENERIC_XML" && !fieldMappings.trim()) {
      setError(t("fieldMappingsRequired"));
      return;
    }

    const upload = new FormData();
    upload.set("file", file);
    upload.set("kind", kind);
    if (kind === "GENERIC_XML") upload.set("fieldMappings", fieldMappings);

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/imports/upload-xml`, {
        method: "POST",
        body: upload,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? t("error"));
        return;
      }
      const data = (await res.json()) as { connectionId: string };
      router.push(`/${locale}/dashboard/imports/${data.connectionId}`);
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="rounded-md border bg-muted/20 p-4">
      <summary className="cursor-pointer text-sm font-medium">{t("title")}</summary>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <label className="block text-sm">
          <span className="block font-medium">{t("kind")}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="input mt-1 w-full"
          >
            <option value="KYERO">Kyero</option>
            <option value="RESALE_ONLINE">Resale Online</option>
            <option value="GENERIC_XML">Generic XML</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="block font-medium">{t("file")}</span>
          <input name="file" type="file" accept=".xml,application/xml,text/xml" className="mt-1" />
          <span className="block text-xs text-muted-foreground mt-1">{t("fileHint")}</span>
        </label>
        {kind === "GENERIC_XML" && (
          <label className="block text-sm">
            <span className="block font-medium">{t("fieldMappings")}</span>
            <textarea
              value={fieldMappings}
              onChange={(e) => setFieldMappings(e.target.value)}
              rows={6}
              className="input mt-1 w-full font-mono text-xs"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t("uploading") : t("submit")}
        </button>
      </form>
    </details>
  );
}
