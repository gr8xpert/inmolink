"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

type State = { ok: boolean; error?: string; messageId?: string };

export async function saveEmailConfigAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const smtpHost = String(formData.get("smtpHost") ?? "");
  const smtpPort = Number(formData.get("smtpPort") ?? 587);
  const smtpUser = String(formData.get("smtpUser") ?? "");
  const smtpPasswordRaw = String(formData.get("smtpPassword") ?? "");
  const smtpPassword = smtpPasswordRaw || undefined;
  const smtpSecure = formData.get("smtpSecure") === "on";
  const fromEmail = String(formData.get("fromEmail") ?? "");
  const fromName = String(formData.get("fromName") ?? "");
  const dkimDomain = String(formData.get("dkimDomain") ?? "").trim() || null;
  const dkimSelector = String(formData.get("dkimSelector") ?? "").trim() || null;

  try {
    await apiFetch("/api/dashboard/marketing/email-config", {
      method: "PUT",
      body: JSON.stringify({
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        smtpSecure,
        fromEmail,
        fromName,
        dkimDomain,
        dkimSelector,
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Save failed" };
  }
  revalidatePath(`/${locale}/dashboard/agency/email-config`);
  return { ok: true };
}

export async function testSendAction(_prev: State | null, formData: FormData): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const to = String(formData.get("to") ?? "").trim() || undefined;
  try {
    const r = await apiFetch<{ ok: boolean; messageId?: string; error?: string }>(
      "/api/dashboard/marketing/email-config/test-send",
      { method: "POST", body: JSON.stringify({ to }) },
    );
    revalidatePath(`/${locale}/dashboard/agency/email-config`);
    return { ok: r.ok, error: r.error, messageId: r.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Test failed" };
  }
}

export async function rotateDkimAction(): Promise<State> {
  try {
    const r = await apiFetch<{ selector: string; publicKey: string }>(
      "/api/dashboard/marketing/email-domains/dkim/rotate",
      { method: "POST", body: JSON.stringify({}) },
    );
    return { ok: true, error: `Selector ${r.selector} · publicKey ${r.publicKey.slice(0, 32)}…` };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Rotate failed" };
  }
}
