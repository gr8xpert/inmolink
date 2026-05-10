"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

type State = { ok: boolean; error?: string };

export async function replayDeliveryAction(formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return { ok: false, error: "id required" };
  try {
    await apiFetch(`/api/dashboard/admin/webhook-deliveries/${encodeURIComponent(id)}/replay`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Replay failed" };
  }
  revalidatePath(`/${locale}/dashboard/admin/webhook-deliveries`);
  revalidatePath(`/${locale}/dashboard/admin/webhook-deliveries/${id}`);
  return { ok: true };
}
