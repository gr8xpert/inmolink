"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function createTemplateAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("bodyHtml") ?? "");
  const bodyText = String(formData.get("bodyText") ?? "") || null;

  if (!name || !subject || !bodyHtml) {
    return { ok: false, error: "Name, subject, and body are required" };
  }
  try {
    await apiFetch("/api/dashboard/marketing/templates", {
      method: "POST",
      body: JSON.stringify({ name, subject, bodyHtml, bodyText }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
  revalidatePath(`/${locale}/dashboard/marketing/templates`);
  return { ok: true };
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/marketing/templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/marketing/templates`);
  redirect(`/${locale}/dashboard/marketing/templates`);
}
