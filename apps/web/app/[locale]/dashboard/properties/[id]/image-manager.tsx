"use client";

import type { propertyImageSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteImageAction, patchImageAction, swapImagePositionsAction } from "./actions";

/**
 * Per-image management UI. Owner-only — rendered alongside the gallery
 * on the detail page when the viewer matches the api ownership matrix.
 *
 * Each card exposes:
 *   - alt-text input (saved on blur via PATCH)
 *   - "Set cover" button (PATCH isCover=true; api unsets the previous cover)
 *   - up / down arrows (parallel PATCH that swaps the moved image's
 *     position with the neighbor's; revalidatePath on the server side
 *     refreshes the page's data)
 *   - "Delete" (DELETE — the api decrements MediaObject.refCount and
 *     schedules cleanup if it hits 0)
 */

type ImageDto = propertyImageSchemas.PropertyImageDto;

type Props = {
  locale: string;
  propertyId: string;
  images: ImageDto[];
};

export function ImageManager({ locale, propertyId, images }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sorted by position ASC, createdAt ASC — same as the api's read order.
  const ordered = [...images].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.localeCompare(b.createdAt);
  });

  function refreshAfter(res: { ok: boolean; error?: string }) {
    if (!res.ok) setError(res.error ?? "Update failed");
    else router.refresh();
  }

  function onAltBlur(image: ImageDto, value: string) {
    if (value === (image.altText ?? "")) return;
    setError(null);
    startTransition(async () => {
      refreshAfter(
        await patchImageAction(locale, propertyId, image.id, {
          altText: value === "" ? null : value,
        }),
      );
    });
  }

  function onSetCover(image: ImageDto) {
    if (image.isCover) return;
    setError(null);
    startTransition(async () => {
      refreshAfter(await patchImageAction(locale, propertyId, image.id, { isCover: true }));
    });
  }

  function onDelete(image: ImageDto) {
    if (!window.confirm("Delete this image?")) return;
    setError(null);
    startTransition(async () => {
      refreshAfter(await deleteImageAction(locale, propertyId, image.id));
    });
  }

  function onMove(image: ImageDto, direction: -1 | 1) {
    const idx = ordered.findIndex((i) => i.id === image.id);
    const neighborIdx = idx + direction;
    const neighbor = ordered[neighborIdx];
    if (!neighbor) return;
    setError(null);
    startTransition(async () => {
      refreshAfter(
        await swapImagePositionsAction(
          locale,
          propertyId,
          { imageId: image.id, position: image.position },
          { imageId: neighbor.id, position: neighbor.position },
        ),
      );
    });
  }

  if (ordered.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Manage images</h2>
        {pending && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <ul className="grid gap-3">
        {ordered.map((img, idx) => (
          <li
            key={img.id}
            className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row"
          >
            <img
              src={img.publicUrl}
              alt={img.altText ?? ""}
              className="aspect-video h-24 w-full shrink-0 rounded object-cover sm:w-32"
            />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  pos {img.position} · #{img.id.slice(0, 8)}
                </span>
                {img.isCover && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Cover
                  </span>
                )}
              </div>
              <input
                type="text"
                defaultValue={img.altText ?? ""}
                placeholder="Alt text (for accessibility + SEO)"
                onBlur={(e) => onAltBlur(img, e.target.value)}
                disabled={pending}
                className="input"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending || img.isCover}
                  onClick={() => onSetCover(img)}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Set as cover
                </button>
                <button
                  type="button"
                  disabled={pending || idx === 0}
                  onClick={() => onMove(img, -1)}
                  aria-label="Move up"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={pending || idx === ordered.length - 1}
                  onClick={() => onMove(img, 1)}
                  aria-label="Move down"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDelete(img)}
                  className="ml-auto rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
