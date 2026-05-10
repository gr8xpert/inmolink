"use server";

import { ApiError, apiFetch } from "@/lib/api";

export type RegenerateSitemapResult =
  | { ok: true; jobId: string }
  | { ok: false; status?: number; error: string };

export async function regenerateSitemapAction(_locale: string): Promise<RegenerateSitemapResult> {
  try {
    const data = await apiFetch<{ jobId: string }>("/api/dashboard/admin/sitemap/regenerate", {
      method: "POST",
    });
    return { ok: true, jobId: data.jobId };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}
