"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function addSuppressionAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email required" };
  try {
    await apiFetch("/api/dashboard/marketing/suppressions", {
      method: "POST",
      body: JSON.stringify({ email, reason: "MANUAL" }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Add failed" };
  }
  revalidatePath(`/${locale}/dashboard/marketing/suppressions`);
  return { ok: true };
}

export async function removeSuppressionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/suppressions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/suppressions`);
  redirect(`/${locale}/dashboard/marketing/suppressions`);
}
