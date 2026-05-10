"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { adminLocationSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

/**
 * Server-action wrappers for the admin/locations api.
 */

type Result<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

async function call<T>(
  path: string,
  init: RequestInit & { method?: "POST" | "PATCH" | "DELETE" } = { method: "POST" },
): Promise<Result<T>> {
  try {
    const data = await apiFetch<T>(path, init);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Unknown error" };
  }
}

const BASE = "/api/dashboard/admin";

function bust(locale: string) {
  revalidatePath(`/${locale}/dashboard/admin/locations`);
}

export async function createLocationAction(
  locale: string,
  body: adminLocationSchemas.AdminLocationCreate,
) {
  const r = await call<adminLocationSchemas.AdminLocation>(`${BASE}/locations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function updateLocationAction(
  locale: string,
  id: string,
  body: adminLocationSchemas.AdminLocationUpdate,
) {
  const r = await call<adminLocationSchemas.AdminLocation>(
    `${BASE}/locations/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteLocationAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/locations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderLocationAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(`${BASE}/locations/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderAllLocationsAction(
  locale: string,
  parentId: string | null,
  level: adminLocationSchemas.LocationLevel,
  ids: string[],
) {
  const r = await call<{ ok: true }>(`${BASE}/locations/reorder-all`, {
    method: "POST",
    body: JSON.stringify({ parentId, level, ids }),
  });
  if (r.ok) bust(locale);
  return r;
}
