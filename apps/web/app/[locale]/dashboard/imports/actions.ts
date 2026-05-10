"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { feedConnectionSchemas } from "@inmolink/shared";
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

export async function createConnectionAction(
  locale: string,
  input: feedConnectionSchemas.FeedConnectionCreate,
): Promise<Result<feedConnectionSchemas.FeedConnection>> {
  const r = await call<feedConnectionSchemas.FeedConnection>("/api/dashboard/imports", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/imports`);
  return r;
}

export async function updateConnectionAction(
  locale: string,
  id: string,
  input: feedConnectionSchemas.FeedConnectionUpdate,
): Promise<Result<feedConnectionSchemas.FeedConnection>> {
  const r = await call<feedConnectionSchemas.FeedConnection>(
    `/api/dashboard/imports/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  if (r.ok) {
    revalidatePath(`/${locale}/dashboard/imports`);
    revalidatePath(`/${locale}/dashboard/imports/${id}`);
  }
  return r;
}

export async function deleteConnectionAction(
  locale: string,
  id: string,
): Promise<Result<{ ok: true }>> {
  const r = await call<{ ok: true }>(`/api/dashboard/imports/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/imports`);
  return r;
}

export async function triggerRunAction(
  locale: string,
  id: string,
): Promise<Result<{ runId: string; jobId: string }>> {
  const r = await call<{ runId: string; jobId: string }>(
    `/api/dashboard/imports/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/imports/${id}`);
  return r;
}

export async function toggleSyncAction(
  locale: string,
  id: string,
  enabled: boolean,
): Promise<Result<feedConnectionSchemas.FeedConnection>> {
  return updateConnectionAction(locale, id, { syncEnabled: enabled });
}
