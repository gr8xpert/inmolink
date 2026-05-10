"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string; ticketId?: string };

export async function createTicketAction(_prev: State | null, formData: FormData): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const subject = String(formData.get("subject") ?? "").trim();
  const category = String(formData.get("category") ?? "OTHER");
  const priority = String(formData.get("priority") ?? "NORMAL");
  const body = String(formData.get("body") ?? "").trim();

  if (!subject || !body) return { ok: false, error: "Subject and body required" };

  try {
    const r = await apiFetch<{ id: string }>("/api/dashboard/tickets", {
      method: "POST",
      body: JSON.stringify({ subject, category, priority, body, attachments: [] }),
    });
    revalidatePath(`/${locale}/dashboard/tickets`);
    redirect(`/${locale}/dashboard/tickets/${r.id}`);
  } catch (err) {
    if ((err as Error).message === "NEXT_REDIRECT") throw err;
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
}

export async function replyTicketAction(_prev: State | null, formData: FormData): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const isInternal = formData.get("isInternal") === "on";
  if (!id || !body) return { ok: false, error: "Body required" };
  try {
    await apiFetch(`/api/dashboard/tickets/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify({ body, isInternal, attachments: [] }),
    });
    revalidatePath(`/${locale}/dashboard/tickets/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Reply failed" };
  }
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id || !status) return;
  try {
    await apiFetch(`/api/dashboard/tickets/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/tickets/${id}`);
}
