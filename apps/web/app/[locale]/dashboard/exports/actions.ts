"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type State = { ok: boolean; error?: string };

export async function createExportAction(_prev: State | null, formData: FormData): Promise<State> {
  const locale = String(formData.get("locale") ?? "en");
  const kind = String(formData.get("kind") ?? "CSV") as "CSV" | "PDF_PROPERTY" | "PDF_PORTFOLIO";
  const propertyIdsRaw = String(formData.get("propertyIds") ?? "").trim();
  const propertyIds = propertyIdsRaw
    ? propertyIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const status = String(formData.get("status") ?? "").trim() || undefined;
  const visibility = String(formData.get("visibility") ?? "").trim() || undefined;
  const propertyTypeId = String(formData.get("propertyTypeId") ?? "").trim() || undefined;

  const filters =
    !propertyIds && (status || visibility || propertyTypeId)
      ? { status, visibility, propertyTypeId }
      : undefined;

  const body: Record<string, unknown> = { kind, locale };
  if (propertyIds && propertyIds.length > 0) body.propertyIds = propertyIds;
  if (filters) body.filters = filters;
  if (!body.propertyIds && !body.filters) {
    return { ok: false, error: "Provide property IDs or at least one filter" };
  }

  try {
    await apiFetch("/api/dashboard/exports", { method: "POST", body: JSON.stringify(body) });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Create failed" };
  }
  revalidatePath(`/${locale}/dashboard/exports`);
  return { ok: true };
}

export async function deleteExportAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const locale = String(formData.get("locale") ?? "en");
  if (!id) return;
  try {
    await apiFetch(`/api/dashboard/exports/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // ignored
  }
  revalidatePath(`/${locale}/dashboard/exports`);
  redirect(`/${locale}/dashboard/exports`);
}
