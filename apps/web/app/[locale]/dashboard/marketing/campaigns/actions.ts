"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function createCampaignAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("bodyHtml") ?? "");
  const bodyText = String(formData.get("bodyText") ?? "") || null;
  const source = String(formData.get("source") ?? "contacts") as "contacts" | "leads";
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  if (!name || !subject || !bodyHtml) {
    return { ok: false, error: "Name, subject, body required" };
  }
  try {
    await apiFetch("/api/dashboard/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name,
        subject,
        bodyHtml,
        bodyText,
        recipientFilter: { source, ...(tags ? { tags } : {}) },
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
  revalidatePath(`/${locale}/dashboard/marketing/campaigns`);
  return { ok: true };
}

export async function sendNowAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/campaigns/${encodeURIComponent(id)}/send-now`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/campaigns`);
  redirect(`/${locale}/dashboard/marketing/campaigns`);
}

export async function cancelCampaignAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/campaigns/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/campaigns`);
  redirect(`/${locale}/dashboard/marketing/campaigns`);
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/campaigns/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/campaigns`);
  redirect(`/${locale}/dashboard/marketing/campaigns`);
}
