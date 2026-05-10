"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { twoFactorSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

async function call<T>(path: string, body?: unknown): Promise<Result<T>> {
  try {
    const data = await apiFetch<T>(path, {
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

export async function startEnrollAction(): Promise<Result<twoFactorSchemas.TotpEnrollResponse>> {
  return call<twoFactorSchemas.TotpEnrollResponse>("/api/dashboard/me/two-factor/enroll");
}

export async function verifyEnrollAction(
  locale: string,
  input: twoFactorSchemas.TotpVerifyInput,
): Promise<Result<twoFactorSchemas.TotpVerifyResponse>> {
  const r = await call<twoFactorSchemas.TotpVerifyResponse>(
    "/api/dashboard/me/two-factor/verify",
    input,
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/settings`);
  return r;
}

export async function disableTwoFactorAction(
  locale: string,
  input: twoFactorSchemas.TotpDisableInput,
): Promise<Result<{ disabled: true }>> {
  const r = await call<{ disabled: true }>("/api/dashboard/me/two-factor/disable", input);
  if (r.ok) revalidatePath(`/${locale}/dashboard/settings`);
  return r;
}
