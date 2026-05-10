"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string; secret?: string };

const ALL_EVENT_TYPES = [
  "PROPERTY_CREATED",
  "PROPERTY_UPDATED",
  "PROPERTY_DELETED",
  "LEAD_CREATED",
  "VIEWING_REQUESTED",
  "VIEWING_ACCEPTED",
  "VIEWING_DECLINED",
  "VIEWING_COMPLETED",
  "DEAL_CONFIRMED",
  "DEAL_DISPUTED",
  "AGENT_INVITED",
  "AGENT_JOINED",
  "IMPORT_RUN_COMPLETED",
  "IMPORT_RUN_FAILED",
  "CHAT_MESSAGE_RECEIVED",
];

function pickEvents(formData: FormData): string[] {
  return ALL_EVENT_TYPES.filter((e) => formData.get(`event:${e}`) === "on");
}

export async function createEndpointAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const url = String(formData.get("url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const events = pickEvents(formData);
  const secretRaw = String(formData.get("secret") ?? "").trim();

  if (!url) return { ok: false, error: "URL is required" };
  if (events.length === 0) return { ok: false, error: "Select at least one event" };

  try {
    const r = await apiFetch<{ endpoint: { id: string }; secret: string }>(
      "/api/dashboard/agency/webhooks",
      {
        method: "POST",
        body: JSON.stringify({
          url,
          events,
          description,
          isActive: true,
          ...(secretRaw ? { secret: secretRaw } : {}),
        }),
      },
    );
    revalidatePath(`/${locale}/dashboard/agency/webhooks`);
    return { ok: true, secret: r.secret };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
}

export async function deleteEndpointAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/agency/webhooks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/agency/webhooks`);
  redirect(`/${locale}/dashboard/agency/webhooks`);
}

export async function testEndpointAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const eventType = String(formData.get("eventType") ?? "PROPERTY_CREATED");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/agency/webhooks/${encodeURIComponent(id)}/test`, {
      method: "POST",
      body: JSON.stringify({ eventType }),
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/agency/webhooks`);
}
