"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { agencySchemas } from "@inmolink/shared";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; agency: T } | { ok: false; status?: number; error: string };

async function patch<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const agency = await apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
    return { ok: true, agency };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

export async function saveAgencyDetailsAction(
  locale: string,
  input: agencySchemas.AgencyDetailsUpdateInput,
): Promise<Result<agencySchemas.AgencyDetail>> {
  const r = await patch<agencySchemas.AgencyDetail>("/api/dashboard/agency/details", input);
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency`);
  return r;
}

export async function saveAgencyBrandingAction(
  locale: string,
  input: agencySchemas.AgencyBrandingUpdateInput,
): Promise<Result<agencySchemas.AgencyDetail>> {
  const r = await patch<agencySchemas.AgencyDetail>("/api/dashboard/agency/branding", input);
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency`);
  return r;
}

export async function saveAgencyTranslationsAction(
  locale: string,
  input: agencySchemas.AgencyTranslationsUpdateInput,
): Promise<Result<agencySchemas.AgencyDetail>> {
  const r = await patch<agencySchemas.AgencyDetail>("/api/dashboard/agency/translations", input);
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency`);
  return r;
}

export async function saveAgencySettingsAction(
  locale: string,
  input: agencySchemas.AgencySettingsUpdateInput,
): Promise<Result<agencySchemas.AgencyDetail>> {
  const r = await patch<agencySchemas.AgencyDetail>("/api/dashboard/agency/settings", input);
  if (r.ok) revalidatePath(`/${locale}/dashboard/agency`);
  return r;
}
