"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { meSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

export type SavePreferencesResult =
  | { ok: true; settings: meSchemas.UserSettingsT }
  | { ok: false; status?: number; error: string };

export async function savePreferencesAction(
  locale: string,
  input: meSchemas.UserSettingsUpdateInput,
): Promise<SavePreferencesResult> {
  try {
    const settings = await apiFetch<meSchemas.UserSettingsT>("/api/dashboard/me/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    revalidatePath(`/${locale}/dashboard/settings/preferences`);
    return { ok: true, settings };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
}
