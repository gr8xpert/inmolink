"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { viewingRequestSchemas } from "@inmolink/shared";
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

export async function createViewingAction(
  locale: string,
  input: viewingRequestSchemas.ViewingRequestCreate,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>("/api/dashboard/viewings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (r.ok) revalidatePath(`/${locale}/dashboard/viewings`);
  return r;
}

export async function acceptViewingAction(
  locale: string,
  id: string,
  input: viewingRequestSchemas.ViewingRequestAccept,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}/accept`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) {
    revalidatePath(`/${locale}/dashboard/viewings`);
    revalidatePath(`/${locale}/dashboard/viewings/${id}`);
  }
  return r;
}

export async function declineViewingAction(
  locale: string,
  id: string,
  input: viewingRequestSchemas.ViewingRequestDecline,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}/decline`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) {
    revalidatePath(`/${locale}/dashboard/viewings`);
    revalidatePath(`/${locale}/dashboard/viewings/${id}`);
  }
  return r;
}

export async function rescheduleViewingAction(
  locale: string,
  id: string,
  input: viewingRequestSchemas.ViewingRequestReschedule,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}/reschedule`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/viewings/${id}`);
  return r;
}

export async function cancelViewingAction(
  locale: string,
  id: string,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/viewings/${id}`);
  return r;
}

export async function setOutcomeAction(
  locale: string,
  id: string,
  input: viewingRequestSchemas.ViewingRequestOutcome,
): Promise<Result<viewingRequestSchemas.ViewingRequest>> {
  const r = await call<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}/outcome`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/viewings/${id}`);
  return r;
}
