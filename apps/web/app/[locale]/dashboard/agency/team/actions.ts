"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { inviteSchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

async function call<T>(
  path: string,
  init: RequestInit & { method?: "POST" | "PATCH" | "DELETE" } = { method: "POST" },
): Promise<Result<T>> {
  try {
    const data = await apiFetch<T>(path, init);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

export async function sendInviteAction(
  locale: string,
  input: inviteSchemas.InviteCreateInput,
): Promise<Result<inviteSchemas.InviteSummary>> {
  const r = await call<inviteSchemas.InviteSummary>(
    `/api/dashboard/agency/invites?locale=${encodeURIComponent(locale)}`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency/team`);
  return r;
}

export async function resendInviteAction(
  locale: string,
  inviteId: string,
): Promise<Result<inviteSchemas.InviteSummary>> {
  const r = await call<inviteSchemas.InviteSummary>(
    `/api/dashboard/agency/invites/${encodeURIComponent(inviteId)}/resend?locale=${encodeURIComponent(locale)}`,
    { method: "POST" },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency/team`);
  return r;
}

export async function revokeInviteAction(
  locale: string,
  inviteId: string,
): Promise<Result<{ ok: true }>> {
  const r = await call<{ ok: true }>(
    `/api/dashboard/agency/invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE" },
  );
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency/team`);
  return r;
}
