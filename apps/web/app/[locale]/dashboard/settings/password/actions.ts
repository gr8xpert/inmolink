"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { meSchemas } from "@inmolink/shared";

export type ChangePasswordResult = { ok: true } | { ok: false; status?: number; error: string };

export async function changePasswordAction(
  input: meSchemas.PasswordChangeInput,
): Promise<ChangePasswordResult> {
  try {
    await apiFetch<null>("/api/dashboard/me/password", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
}
