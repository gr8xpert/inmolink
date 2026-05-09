"use client";

import type { uploadSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { attachImagesAction, registerUploadsAction, signUploadsAction } from "./actions";

/**
 * Image upload pipeline (browser side). PLAN §5 / §5.1, slice F.3.a.
 *
 *   1. SHA-256 each file via Web Crypto.
 *   2. POST `/api/uploads/sign` (server-action wrapper).
 *      - dedup hits return `mediaObjectId` directly — no PUT needed.
 *      - novel files return a presigned PUT URL.
 *   3. PUT each novel file directly to the storage backend (R2 in prod,
 *      local-fs route in dev). The url is HMAC-bound to the key, expiry,
 *      and content-type — no Auth cookie travels with this request.
 *   4. POST `/api/uploads/register` so the server re-hashes + creates the
 *      MediaObject row with refCount=0 + 24h orphan grace.
 *   5. POST `/api/dashboard/properties/:id/images` to attach. Service
 *      bumps refCount + clears scheduledDeleteAt. Cover-uniqueness
 *      enforced server-side.
 *
 * The widget surfaces per-file status so partial failures are visible —
 * if step 3 fails for one file, the rest of the batch still proceeds.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file (UI cap; api cap is 500 MB)
const MAX_FILES_PER_BATCH = 20;

type FileStatus =
  | { phase: "queued" }
  | { phase: "hashing" }
  | { phase: "signing" }
  | { phase: "uploading"; pct?: number }
  | { phase: "registering" }
  | { phase: "attaching" }
  | { phase: "done"; mediaObjectId: string }
  | { phase: "error"; error: string };

type Tracked = {
  id: string; // local row key
  file: File;
  status: FileStatus;
  hash?: string;
  width?: number;
  height?: number;
};

type Props = {
  locale: string;
  propertyId: string;
};

export function ImageUploader({ locale, propertyId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Tracked[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  const updateItem = useCallback((id: string, patch: Partial<Tracked>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const onFilesPicked = useCallback(async (files: FileList | File[]) => {
    setBatchError(null);
    const accepted: Tracked[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_MIME.has(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      accepted.push({ id: crypto.randomUUID(), file: f, status: { phase: "queued" } });
    }
    if (accepted.length === 0) {
      setBatchError("No valid image files in selection.");
      return;
    }
    if (accepted.length > MAX_FILES_PER_BATCH) {
      setBatchError(`Select at most ${MAX_FILES_PER_BATCH} files at a time.`);
      return;
    }
    setItems(accepted);
    startTransition(() => uploadBatch(accepted));
  }, []);

  async function uploadBatch(batch: Tracked[]) {
    // Local error set — state updates are async, so we can't rely on
    // `items` inside this closure to know who's still alive.
    const errored = new Set<string>();
    const markError = (id: string, error: string) => {
      errored.add(id);
      updateItem(id, { status: { phase: "error", error } });
    };

    // 1. Hash + dimensions in parallel.
    const hashed = await Promise.all(
      batch.map(async (it) => {
        try {
          updateItem(it.id, { status: { phase: "hashing" } });
          const buf = await it.file.arrayBuffer();
          const hashBuf = await crypto.subtle.digest("SHA-256", buf);
          const hash = Array.from(new Uint8Array(hashBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          let width: number | undefined;
          let height: number | undefined;
          try {
            const bitmap = await createImageBitmap(it.file);
            width = bitmap.width;
            height = bitmap.height;
            bitmap.close();
          } catch {
            // Some HEIC files can't decode in-browser — the server stores
            // the bytes anyway, width/height just stay null.
          }
          updateItem(it.id, { hash, width, height });
          return { id: it.id, file: it.file, hash, width, height };
        } catch (e) {
          markError(it.id, e instanceof Error ? e.message : "hash failed");
          return null;
        }
      }),
    );
    const live = hashed.filter((r): r is NonNullable<typeof r> => r !== null);
    if (live.length === 0) return;

    // 2. Sign — single round-trip.
    for (const r of live) updateItem(r.id, { status: { phase: "signing" } });
    const signRes = await signUploadsAction(
      live.map((r) => ({
        hash: r.hash,
        mimeType: r.file.type as uploadSchemas.MediaMimeType,
        bytes: r.file.size,
        width: r.width ?? null,
        height: r.height ?? null,
      })),
    );
    if (!signRes.ok) {
      setBatchError(signRes.error);
      for (const r of live) markError(r.id, signRes.error);
      return;
    }
    const sigByHash = new Map(signRes.data.results.map((s) => [s.hash, s]));

    // 3. PUT each novel file. Dedup hits skip straight to register/attach.
    await Promise.all(
      live.map(async (r) => {
        if (errored.has(r.id)) return;
        const sig = sigByHash.get(r.hash);
        if (!sig) {
          markError(r.id, "missing sign result for hash");
          return;
        }
        if (sig.status === "exists") {
          updateItem(r.id, { status: { phase: "registering" } });
          return;
        }
        try {
          updateItem(r.id, { status: { phase: "uploading" } });
          const putRes = await fetch(sig.uploadUrl, {
            method: "PUT",
            body: r.file,
            headers: sig.requiredHeaders,
          });
          if (!putRes.ok) throw new Error(`PUT ${putRes.status} ${putRes.statusText}`);
          updateItem(r.id, { status: { phase: "registering" } });
        } catch (e) {
          markError(r.id, e instanceof Error ? e.message : "upload failed");
        }
      }),
    );

    const uploaded = live.filter((r) => !errored.has(r.id));
    if (uploaded.length === 0) return;

    // 4. Register — bulk.
    const registerRes = await registerUploadsAction(
      uploaded.map((r) => ({
        hash: r.hash,
        mimeType: r.file.type as uploadSchemas.MediaMimeType,
        width: r.width ?? null,
        height: r.height ?? null,
      })),
    );
    if (!registerRes.ok) {
      setBatchError(registerRes.error);
      for (const r of uploaded) markError(r.id, registerRes.error);
      return;
    }
    const idByHash = new Map(registerRes.data.results.map((res) => [res.hash, res.mediaObjectId]));

    // 5. Attach — bulk.
    for (const r of uploaded) updateItem(r.id, { status: { phase: "attaching" } });
    const mediaIds = uploaded
      .map((r) => idByHash.get(r.hash))
      .filter((id): id is string => Boolean(id));
    const attachRes = await attachImagesAction(
      locale,
      propertyId,
      mediaIds.map((mediaObjectId) => ({ mediaObjectId })),
    );
    if (!attachRes.ok) {
      setBatchError(attachRes.error);
      for (const r of uploaded) markError(r.id, attachRes.error);
      return;
    }
    for (const r of uploaded) {
      const id = idByHash.get(r.hash);
      if (id) updateItem(r.id, { status: { phase: "done", mediaObjectId: id } });
    }
    router.refresh();
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) onFilesPicked(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      {batchError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {batchError}
        </div>
      )}

      <label
        htmlFor="image-uploader-input"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={onDrop}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center text-sm transition hover:bg-muted/50"
      >
        <span className="font-medium">Drop images here, or click to pick</span>
        <span className="mt-1 text-xs text-muted-foreground">
          JPEG · PNG · WebP · AVIF · HEIC · GIF — up to 25 MB each, max {MAX_FILES_PER_BATCH} per
          batch
        </span>
        <input
          id="image-uploader-input"
          type="file"
          accept={Array.from(ALLOWED_MIME).join(",")}
          multiple
          className="sr-only"
          disabled={pending}
          onChange={(e) => e.target.files && onFilesPicked(e.target.files)}
        />
      </label>

      {items.length > 0 && (
        <ul className="divide-y rounded-md border bg-background">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {it.file.name} · {(it.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <StatusBadge status={it.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const map: Record<FileStatus["phase"], { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-zinc-100 text-zinc-700" },
    hashing: { label: "Hashing…", cls: "bg-zinc-100 text-zinc-700" },
    signing: { label: "Signing…", cls: "bg-zinc-100 text-zinc-700" },
    uploading: { label: "Uploading…", cls: "bg-amber-100 text-amber-800" },
    registering: { label: "Registering…", cls: "bg-amber-100 text-amber-800" },
    attaching: { label: "Attaching…", cls: "bg-amber-100 text-amber-800" },
    done: { label: "Done", cls: "bg-emerald-100 text-emerald-800" },
    error: { label: "Error", cls: "bg-rose-100 text-rose-800" },
  };
  const m = map[status.phase];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}
      title={status.phase === "error" ? status.error : undefined}
    >
      {m.label}
    </span>
  );
}
