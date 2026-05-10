"use client";

import { registerUploads, signUploads } from "@/lib/uploads";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveAgencyBrandingAction } from "./actions";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

type Slot = "logoR2Key" | "bannerR2Key" | "heroImageR2Key";

type Props = {
  locale: string;
  slot: Slot;
  label: string;
  currentUrl: string | null;
  aspect?: "square" | "wide";
};

export function BrandingUploader({ locale, slot, label, currentUrl, aspect = "wide" }: Props) {
  const t = useTranslations("agency.branding");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<string | null>(null);

  function reset() {
    setError(null);
    setLivePreview(null);
  }

  function handlePick(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    reset();

    if (!ALLOWED.has(file.type)) {
      setError(t("wrongType"));
      input.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("tooLarge"));
      input.value = "";
      return;
    }
    setLivePreview(URL.createObjectURL(file));

    start(async () => {
      try {
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const hash = [...new Uint8Array(hashBuf)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const signed = await signUploads([
          { hash, mimeType: file.type as "image/jpeg", bytes: file.size },
        ]);
        if (!signed.ok) throw new Error(signed.error);
        const sign = signed.data.results[0];
        if (!sign) throw new Error("No sign result");

        let key: string;
        if (sign.status === "exists") {
          key = sign.key;
        } else {
          const put = await fetch(sign.uploadUrl, {
            method: "PUT",
            body: file,
            headers: sign.requiredHeaders,
          });
          if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
          const reg = await registerUploads([{ hash, mimeType: file.type as "image/jpeg" }]);
          if (!reg.ok) throw new Error(reg.error);
          const r = reg.data.results[0];
          if (!r) throw new Error("No register result");
          key = sign.key;
        }

        const saved = await saveAgencyBrandingAction(locale, { [slot]: key });
        if (!saved.ok) throw new Error(saved.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        input.value = "";
      }
    });
  }

  function handleRemove() {
    reset();
    start(async () => {
      const saved = await saveAgencyBrandingAction(locale, { [slot]: null });
      if (!saved.ok) setError(saved.error);
    });
  }

  const previewUrl = livePreview ?? currentUrl;
  const aspectClass = aspect === "square" ? "aspect-square w-32" : "aspect-[3/1] w-full max-w-md";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        className={`overflow-hidden rounded-md border bg-muted/30 ${aspectClass} flex items-center justify-center`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex gap-2">
        <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            className="hidden"
            onChange={(e) => handlePick(e.currentTarget)}
          />
          {pending ? t("saving") : t("upload")}
        </label>
        {currentUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t("remove")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
