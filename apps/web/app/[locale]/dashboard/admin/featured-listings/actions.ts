"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function createFeaturedAction(
  _prev: State | null,
  formData: FormData,
): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const propertyId = String(formData.get("propertyId") ?? "");
  const surface = String(formData.get("surface") ?? "PUBLIC_HOME");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const position = Number(formData.get("position") ?? 0);

  if (!propertyId || !startsAt || !endsAt) {
    return { ok: false, error: "propertyId, startsAt, endsAt required" };
  }
  try {
    await apiFetch("/api/dashboard/admin/featured-listings", {
      method: "POST",
      body: JSON.stringify({
        propertyId,
        surface,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        position,
        source: "PLAN_INCLUDED",
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed" };
  }
  revalidatePath(`/${locale}/dashboard/admin/featured-listings`);
  return { ok: true };
}

export async function deleteFeaturedAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/admin/featured-listings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/admin/featured-listings`);
  redirect(`/${locale}/dashboard/admin/featured-listings`);
}
