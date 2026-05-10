"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { uploadSchemas } from "@inmolink/shared";

/**
 * Shared upload-pipeline Server Actions used by every upload widget on the
 * dashboard side (property images, agency branding, user photo, custom
 * SVG icons). Mirrors the property-images per-page versions but lives in
 * /lib so we don't duplicate the cookie-forwarding wrapper N times.
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
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Unknown error" };
  }
}

export async function signUploads(
  files: uploadSchemas.SignUploadFile[],
): Promise<ActionResult<{ results: uploadSchemas.SignUploadResult[] }>> {
  return call("/api/uploads/sign", { method: "POST", body: JSON.stringify({ files }) });
}

export async function registerUploads(
  uploads: uploadSchemas.RegisterUploadFile[],
): Promise<ActionResult<{ results: uploadSchemas.RegisterUploadResult[] }>> {
  return call("/api/uploads/register", { method: "POST", body: JSON.stringify({ uploads }) });
}
