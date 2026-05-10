"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function grantPlanAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const agencyId = String(formData.get("agencyId") ?? "");
  const planTier = String(formData.get("planTier") ?? "PRO");
  const grantedReason = String(formData.get("grantedReason") ?? "").trim();
  const grantedUntilRaw = String(formData.get("grantedUntil") ?? "").trim();
  const locale = String(formData.get("locale") ?? "en");

  if (!agencyId || !grantedReason) {
    return { ok: false, error: "agencyId and reason are required" };
  }

  try {
    await apiFetch("/api/dashboard/admin/billing/grants", {
      method: "POST",
      body: JSON.stringify({
        agencyId,
        planTier,
        grantedReason,
        grantedUntil: grantedUntilRaw ? new Date(grantedUntilRaw).toISOString() : null,
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Grant failed" };
  }
  revalidatePath(`/${locale}/dashboard/admin/billing`);
  return { ok: true };
}

export async function revokeGrantAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const agencyId = String(formData.get("agencyId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const locale = String(formData.get("locale") ?? "en");
  if (!agencyId) return { ok: false, error: "agencyId required" };

  try {
    await apiFetch("/api/dashboard/admin/billing/grants/revoke", {
      method: "POST",
      body: JSON.stringify({ agencyId, reason }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Revoke failed" };
  }
  revalidatePath(`/${locale}/dashboard/admin/billing`);
  return { ok: true };
}
