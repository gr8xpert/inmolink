"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function createContactAction(_prev: State | null, formData: FormData): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const consentGiven = formData.get("consentGiven") === "on";
  if (!email) return { ok: false, error: "Email required" };

  try {
    await apiFetch("/api/dashboard/marketing/contacts", {
      method: "POST",
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        tags,
        source: "MANUAL",
        consentGiven,
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
  revalidatePath(`/${locale}/dashboard/marketing/contacts`);
  return { ok: true };
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/contacts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/contacts`);
  redirect(`/${locale}/dashboard/marketing/contacts`);
}
