import { headers } from "next/headers";

/**
 * Server-side fetch wrapper for calling apps/api from React Server
 * Components / Server Actions. Forwards the incoming request's `cookie`
 * header so the api can read the Auth.js session cookie set on the
 * web origin (same-site shared cookies in dev; subdomain in prod).
 *
 * Returns parsed JSON typed as `T`. Throws ApiError on non-2xx so the
 * page can render a typed error boundary.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "ApiError";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(cookie ? { cookie } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    // Page-level cache disabled — every render asks the api fresh.
    // Switch to ISR/tag-based revalidation when this becomes a hotspot.
    cache: "no-store",
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // non-JSON / empty body
  }

  if (!res.ok) {
    const body = parsed as { error?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      body?.message ?? body?.error ?? `API ${res.status} ${res.statusText}`,
      parsed,
    );
  }

  return parsed as T;
}
