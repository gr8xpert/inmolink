"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { propertyImageSchemas, uploadSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

/**
 * Server Actions for the image upload pipeline. All three calls hit the
 * Fastify api on `:3001`; we route them through the web app (rather than
 * having the browser call the api directly) so cookie forwarding via
 * `next/headers` stays uniform and the api's CORS allowlist doesn't have
 * to grow with every new browser-side caller.
 *
 * The signed PUT itself still goes browser → R2 (or browser → dev
 * `/api/_local-storage/upload`) directly — that's the whole point of
 * presigned URLs.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

async function call<T>(
  path: string,
  init: RequestInit & { method?: "POST" | "PATCH" | "DELETE" } = { method: "POST" },
): Promise<ActionResult<T>> {
  try {
    const data = await apiFetch<T>(path, init);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Unknown error" };
  }
}

export async function signUploadsAction(
  files: uploadSchemas.SignUploadFile[],
): Promise<ActionResult<{ results: uploadSchemas.SignUploadResult[] }>> {
  return call("/api/uploads/sign", { method: "POST", body: JSON.stringify({ files }) });
}

export async function registerUploadsAction(
  uploads: uploadSchemas.RegisterUploadFile[],
): Promise<ActionResult<{ results: uploadSchemas.RegisterUploadResult[] }>> {
  return call("/api/uploads/register", { method: "POST", body: JSON.stringify({ uploads }) });
}

export async function attachImagesAction(
  locale: string,
  propertyId: string,
  images: propertyImageSchemas.AttachPropertyImageItem[],
): Promise<ActionResult<{ images: propertyImageSchemas.PropertyImageDto[] }>> {
  const res = await call<{ images: propertyImageSchemas.PropertyImageDto[] }>(
    `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images`,
    { method: "POST", body: JSON.stringify({ images }) },
  );
  if (res.ok) {
    revalidatePath(`/${locale}/dashboard/properties/${propertyId}`);
  }
  return res;
}

export async function patchImageAction(
  locale: string,
  propertyId: string,
  imageId: string,
  body: propertyImageSchemas.PatchPropertyImageRequest,
): Promise<ActionResult<{ image: propertyImageSchemas.PropertyImageDto }>> {
  const res = await call<{ image: propertyImageSchemas.PropertyImageDto }>(
    `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(imageId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (res.ok) {
    revalidatePath(`/${locale}/dashboard/properties/${propertyId}`);
  }
  return res;
}

export async function deleteImageAction(
  locale: string,
  propertyId: string,
  imageId: string,
): Promise<ActionResult<{ ok: true }>> {
  const res = await call<{ ok: true }>(
    `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
  if (res.ok) {
    revalidatePath(`/${locale}/dashboard/properties/${propertyId}`);
  }
  return res;
}

/**
 * Reorder by swapping `imageId` with the neighbor at `withImageId`. Two
 * PATCH calls in parallel — temporary position collision is harmless
 * because reads order by `(position ASC, createdAt ASC)`. revalidates
 * once at the end.
 */
export async function swapImagePositionsAction(
  locale: string,
  propertyId: string,
  a: { imageId: string; position: number },
  b: { imageId: string; position: number },
): Promise<ActionResult<{ ok: true }>> {
  const [r1, r2] = await Promise.all([
    call<unknown>(
      `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(a.imageId)}`,
      { method: "PATCH", body: JSON.stringify({ position: b.position }) },
    ),
    call<unknown>(
      `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(b.imageId)}`,
      { method: "PATCH", body: JSON.stringify({ position: a.position }) },
    ),
  ]);
  if (!r1.ok) return r1;
  if (!r2.ok) return r2;
  revalidatePath(`/${locale}/dashboard/properties/${propertyId}`);
  return { ok: true, data: { ok: true } };
}
