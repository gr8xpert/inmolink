"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { adminFeatureSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

/**
 * Server-action wrappers for the admin/features api. Mirrors
 * admin/property-types/actions.ts but for amenities.
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
  revalidatePath(`/${locale}/dashboard/admin/features`);
}

// ─── Groups ──────────────────────────────────────────────────────────────

export async function createGroupAction(
  locale: string,
  body: adminFeatureSchemas.AdminFeatureGroupCreate,
) {
  const r = await call<adminFeatureSchemas.AdminFeatureGroup>(`${BASE}/feature-groups`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function updateGroupAction(
  locale: string,
  id: string,
  body: adminFeatureSchemas.AdminFeatureGroupUpdate,
) {
  const r = await call<adminFeatureSchemas.AdminFeatureGroup>(
    `${BASE}/feature-groups/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteGroupAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/feature-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderGroupAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(`${BASE}/feature-groups/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderAllGroupsAction(locale: string, ids: string[]) {
  const r = await call<{ ok: true }>(`${BASE}/feature-groups/reorder-all`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (r.ok) bust(locale);
  return r;
}

// ─── Features ───────────────────────────────────────────────────────────

export async function createFeatureAction(
  locale: string,
  body: adminFeatureSchemas.AdminFeatureCreate,
) {
  const r = await call<adminFeatureSchemas.AdminFeature>(`${BASE}/features`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function updateFeatureAction(
  locale: string,
  id: string,
  body: adminFeatureSchemas.AdminFeatureUpdate,
) {
  const r = await call<adminFeatureSchemas.AdminFeature>(
    `${BASE}/features/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteFeatureAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/features/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderFeatureAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(`${BASE}/features/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderAllFeaturesAction(locale: string, groupId: string, ids: string[]) {
  const r = await call<{ ok: true }>(`${BASE}/features/reorder-all`, {
    method: "POST",
    body: JSON.stringify({ groupId, ids }),
  });
  if (r.ok) bust(locale);
  return r;
}

// ─── AI suggester ───────────────────────────────────────────────────────

export async function suggestIconAction(name: string, hint?: string) {
  return call<{ iconName: string | null }>(`${BASE}/features/suggest-icon`, {
    method: "POST",
    body: JSON.stringify({ name, hint }),
  });
}

export async function acceptAiIconAction(locale: string, id: string, iconName: string) {
  const r = await call<adminFeatureSchemas.AdminFeature>(
    `${BASE}/features/${encodeURIComponent(id)}/accept-ai-icon`,
    { method: "POST", body: JSON.stringify({ iconName }) },
  );
  if (r.ok) bust(locale);
  return r;
}
