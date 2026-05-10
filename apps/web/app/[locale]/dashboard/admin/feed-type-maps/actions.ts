"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { adminFeedTypeMapSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  try {
    const data = await apiFetch<T>(path, init);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

export async function createMapAction(
  locale: string,
  input: adminFeedTypeMapSchemas.AdminFeedTypeMapCreate,
): Promise<Result<adminFeedTypeMapSchemas.AdminFeedTypeMap>> {
  const r = await call<adminFeedTypeMapSchemas.AdminFeedTypeMap>(
    "/api/dashboard/admin/feed-type-maps",
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/admin/feed-type-maps`);
  return r;
}

export async function updateMapAction(
  locale: string,
  id: string,
  input: adminFeedTypeMapSchemas.AdminFeedTypeMapUpdate,
): Promise<Result<adminFeedTypeMapSchemas.AdminFeedTypeMap>> {
  const r = await call<adminFeedTypeMapSchemas.AdminFeedTypeMap>(
    `/api/dashboard/admin/feed-type-maps/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/admin/feed-type-maps`);
  return r;
}

export async function deleteMapAction(locale: string, id: string): Promise<Result<{ ok: true }>> {
  const r = await call<{ ok: true }>(
    `/api/dashboard/admin/feed-type-maps/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/admin/feed-type-maps`);
  return r;
}
