"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { dealSchemas } from "@inmolink/shared";
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

export async function createDealAction(
  locale: string,
  input: dealSchemas.DealCreate,
): Promise<Result<dealSchemas.Deal>> {
  const r = await call<dealSchemas.Deal>("/api/dashboard/deals", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/deals`);
  return r;
}

export async function confirmDealAction(
  locale: string,
  id: string,
  input: dealSchemas.DealConfirm,
): Promise<Result<dealSchemas.Deal>> {
  const r = await call<dealSchemas.Deal>(`/api/dashboard/deals/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/deals/${id}`);
  return r;
}

export async function disputeDealAction(
  locale: string,
  id: string,
  input: dealSchemas.DealDispute,
): Promise<Result<dealSchemas.Deal>> {
  const r = await call<dealSchemas.Deal>(`/api/dashboard/deals/${encodeURIComponent(id)}/dispute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (r.ok) {
    revalidatePath(`/${locale}/dashboard/deals/${id}`);
    revalidatePath(`/${locale}/dashboard/admin/disputes`);
  }
  return r;
}

export async function cancelDealAction(
  locale: string,
  id: string,
): Promise<Result<dealSchemas.Deal>> {
  const r = await call<dealSchemas.Deal>(`/api/dashboard/deals/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/deals/${id}`);
  return r;
}

export async function resolveDisputeAction(
  locale: string,
  id: string,
  input: dealSchemas.DealResolveDispute,
): Promise<Result<dealSchemas.Deal>> {
  const r = await call<dealSchemas.Deal>(
    `/api/dashboard/deals/${encodeURIComponent(id)}/resolve-dispute`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) {
    revalidatePath(`/${locale}/dashboard/deals/${id}`);
    revalidatePath(`/${locale}/dashboard/admin/disputes`);
  }
  return r;
}
