"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { propertySchemas } from "@inmolink/shared";
import { redirect } from "next/navigation";

/**
 * Update an existing property via PATCH /api/dashboard/properties/:id.
 * On success: redirect server-side to the detail page so the user sees
 * the saved state. On failure: return typed result for inline rendering.
 */

export type UpdatePropertyResult =
  | { ok: false; status?: number; error: string }
  | { ok: true; id: string };

export async function updatePropertyAction(
  locale: string,
  propertyId: string,
  input: propertySchemas.PropertyUpdateInput,
): Promise<UpdatePropertyResult> {
  let detail: { id: string };
  try {
    detail = await apiFetch<{ id: string }>(
      `/api/dashboard/properties/${encodeURIComponent(propertyId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
  redirect(`/${locale}/dashboard/properties/${detail.id}`);
}
