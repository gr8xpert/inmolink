"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { meSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

export type SaveProfileResult =
  | { ok: true; me: meSchemas.MeDetail }
  | { ok: false; status?: number; error: string };

export async function saveProfileAction(
  locale: string,
  input: meSchemas.ProfileUpdateInput,
): Promise<SaveProfileResult> {
  try {
    const me = await apiFetch<meSchemas.MeDetail>("/api/dashboard/me/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    revalidatePath(`/${locale}/dashboard/settings/profile`);
    revalidatePath(`/${locale}/dashboard/settings`);
    return { ok: true, me };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
}
