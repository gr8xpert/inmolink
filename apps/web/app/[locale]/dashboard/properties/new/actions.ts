"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { propertySchemas } from "@inmolink/shared";
import { redirect } from "next/navigation";

/**
 * Create a property via apps/api. Server Action so the cookie forwarding
 * logic in apiFetch (next/headers) works seamlessly.
 *
 * Returns { ok: false, error } so the form can surface the message inline.
 * On success, redirects to the new property's detail page (server-side
 * navigation — caller doesn't see the return value).
 */

export type CreatePropertyResult =
  | { ok: false; status?: number; error: string }
  | { ok: true; id: string };

export async function createPropertyAction(
  locale: string,
  input: propertySchemas.PropertyCreateInput,
): Promise<CreatePropertyResult> {
  let detail: { id: string };
  try {
    detail = await apiFetch<{ id: string }>("/api/dashboard/properties", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
  // redirect throws, never returns — the union type still satisfies callers.
  redirect(`/${locale}/dashboard/properties/${detail.id}`);
}
