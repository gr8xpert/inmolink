"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { adminLocationGroupSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

/**
 * Server-action wrappers for the admin/location-groups api. Group CRUD
 * mirrors the other admin entities; membership ops are separate so the
 * picker doesn't have to ride on the wholesale-replace translation
 * pattern.
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
  revalidatePath(`/${locale}/dashboard/admin/location-groups`);
}

// ─── Group CRUD ──────────────────────────────────────────────────────────

export async function createGroupAction(
  locale: string,
  body: adminLocationGroupSchemas.AdminLocationGroupCreate,
) {
  const r = await call<adminLocationGroupSchemas.AdminLocationGroup>(`${BASE}/location-groups`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok) bust(locale);
  return r;
}

export async function updateGroupAction(
  locale: string,
  id: string,
  body: adminLocationGroupSchemas.AdminLocationGroupUpdate,
) {
  const r = await call<adminLocationGroupSchemas.AdminLocationGroup>(
    `${BASE}/location-groups/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function deleteGroupAction(locale: string, id: string) {
  const r = await call<{ ok: true }>(`${BASE}/location-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) bust(locale);
  return r;
}

export async function reorderGroupAction(locale: string, id: string, position: number) {
  const r = await call<{ ok: true }>(`${BASE}/location-groups/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });
  if (r.ok) bust(locale);
  return r;
}

// ─── Membership ops ─────────────────────────────────────────────────────

export async function addMemberAction(locale: string, groupId: string, locationId: string) {
  const r = await call<{ ok: true }>(
    `${BASE}/location-groups/${encodeURIComponent(groupId)}/members`,
    { method: "POST", body: JSON.stringify({ locationId }) },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function removeMemberAction(locale: string, groupId: string, locationId: string) {
  const r = await call<{ ok: true }>(
    `${BASE}/location-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(locationId)}`,
    { method: "DELETE" },
  );
  if (r.ok) bust(locale);
  return r;
}

export async function reorderMemberAction(
  locale: string,
  groupId: string,
  locationId: string,
  position: number,
) {
  const r = await call<{ ok: true }>(
    `${BASE}/location-groups/${encodeURIComponent(groupId)}/members/reorder`,
    { method: "POST", body: JSON.stringify({ locationId, position }) },
  );
  if (r.ok) bust(locale);
  return r;
}
