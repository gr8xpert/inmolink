"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { adminPropertyTypeSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

/**
 * Server-action wrappers for the admin/property-types api. All routes
 * are super-admin gated server-side; we still need cookie forwarding via
 * apiFetch so the api can read the role off the JWT.
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
  revalidatePath(`/${locale}/dashboard/admin/property-types`);
}

// ─── Groups ──────────────────────────────────────────────────────────────

export async function createGroupAction(
  locale: string,
  body: adminPropertyTypeSchemas.AdminPropertyTypeGroupCreate,
) {
  const r = await call<adminPropertyTypeSchemas.AdminPropertyTypeGroup>(
    `${BASE}/property-type-groups`,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function updateGroupAction(
  locale: string,
  id: string,
  body: adminPropertyTypeSchemas.AdminPropertyTypeGroupUpdate,
) {
  const r = await call<adminPropertyTypeSchemas.AdminPropertyTypeGroup>(
    `${BASE}/property-type-groups/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteGroupAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/property-type-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderGroupAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(
    `${BASE}/property-type-groups/${encodeURIComponent(id)}/reorder`,
    { method: "POST", body: JSON.stringify({ position }) },
  );
  if (r.ok) bust(locale);
  return r;
}

// ─── Types ───────────────────────────────────────────────────────────────

export async function createTypeAction(
  locale: string,
  body: adminPropertyTypeSchemas.AdminPropertyTypeCreate,
) {
  const r = await call<adminPropertyTypeSchemas.AdminPropertyType>(`${BASE}/property-types`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function updateTypeAction(
  locale: string,
  id: string,
  body: adminPropertyTypeSchemas.AdminPropertyTypeUpdate,
) {
  const r = await call<adminPropertyTypeSchemas.AdminPropertyType>(
    `${BASE}/property-types/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteTypeAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/property-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderTypeAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(`${BASE}/property-types/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });
  if (r.ok) bust(locale);
  return r;
}

// ─── AI suggester ───────────────────────────────────────────────────────

export async function suggestIconAction(name: string, hint?: string) {
  return call<{ iconName: string | null }>(`${BASE}/property-types/suggest-icon`, {
    method: "POST",
    body: JSON.stringify({ name, hint }),
  });
}

export async function acceptAiIconAction(locale: string, id: string, iconName: string) {
  const r = await call<adminPropertyTypeSchemas.AdminPropertyType>(
    `${BASE}/property-types/${encodeURIComponent(id)}/accept-ai-icon`,
    { method: "POST", body: JSON.stringify({ iconName }) },
  );
  if (r.ok) bust(locale);
  return r;
}
