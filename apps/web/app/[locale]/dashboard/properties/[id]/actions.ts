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

async function call<T>(path: string, body: unknown): Promise<ActionResult<T>> {
  try {
    const data = await apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
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
  return call("/api/uploads/sign", { files });
}

export async function registerUploadsAction(
  uploads: uploadSchemas.RegisterUploadFile[],
): Promise<ActionResult<{ results: uploadSchemas.RegisterUploadResult[] }>> {
  return call("/api/uploads/register", { uploads });
}

export async function attachImagesAction(
  locale: string,
  propertyId: string,
  images: propertyImageSchemas.AttachPropertyImageItem[],
): Promise<ActionResult<{ images: propertyImageSchemas.PropertyImageDto[] }>> {
  const res = await call<{ images: propertyImageSchemas.PropertyImageDto[] }>(
    `/api/dashboard/properties/${encodeURIComponent(propertyId)}/images`,
    { images },
  );
  if (res.ok) {
    // Refresh the gallery on the detail page after attach. Cache is
    // path-scoped so other locales / list page aren't disturbed.
    revalidatePath(`/${locale}/dashboard/properties/${propertyId}`);
  }
  return res;
}
