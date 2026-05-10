"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { billingSchemas } from "@inmolink/shared";
import { redirect } from "next/navigation";

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const cycle = String(formData.get("cycle") ?? "MONTHLY") as "MONTHLY" | "YEARLY";
  const currency = String(formData.get("currency") ?? "EUR") as "EUR" | "GBP";
  const locale = String(formData.get("locale") ?? "en");

  let url: string;
  try {
    const res = await apiFetch<{ url: string }>("/api/dashboard/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        cycle,
        currency,
        successPath: `/${locale}/dashboard/billing?checkout=success`,
        cancelPath: `/${locale}/dashboard/billing?checkout=cancelled`,
      }),
    });
    url = res.url;
  } catch (err) {
    const code = err instanceof ApiError ? extractCode(err.body) : "BILLING_ERROR";
    redirect(`/${locale}/dashboard/billing?error=${code}`);
  }
  // redirect throws — must be outside the try/catch so it isn't swallowed
  redirect(url);
}

export async function openPortalAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  let url: string;
  try {
    const res = await apiFetch<{ url: string }>("/api/dashboard/billing/portal", {
      method: "POST",
      body: JSON.stringify({ returnPath: `/${locale}/dashboard/billing` }),
    });
    url = res.url;
  } catch (err) {
    const code = err instanceof ApiError ? extractCode(err.body) : "BILLING_ERROR";
    redirect(`/${locale}/dashboard/billing?error=${code}`);
  }
  redirect(url);
}

export async function saveBillingDetailsAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const billingEmail = String(formData.get("billingEmail") ?? "").trim() || null;
  const vatNumber = String(formData.get("vatNumber") ?? "").trim() || null;
  const vatCountryCode =
    String(formData.get("vatCountryCode") ?? "")
      .trim()
      .toUpperCase() || null;

  try {
    await apiFetch<billingSchemas.BillingSummary>("/api/dashboard/billing/details", {
      method: "PATCH",
      body: JSON.stringify({ billingEmail, vatNumber, vatCountryCode }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : "Failed to save details",
    };
  }
}

function extractCode(body: unknown): string {
  if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
    return body.code;
  }
  return "BILLING_ERROR";
}
