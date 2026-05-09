/**
 * Public marketplace fetch wrapper. No cookie forwarding — every browser
 * that hits the public site is anonymous; the public api routes
 * (`/api/public/*`) accept anon traffic with their own rate limit.
 *
 * ISR-friendly via Next.js fetch revalidation (`next: { revalidate }`).
 * Detail pages set ~5 min; SSR-error / not-found bypasses the cache.
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

export async function publicApiFetch<T>(
  path: string,
  opts: { revalidate?: number; tags?: string[] } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    next: {
      revalidate: opts.revalidate ?? 300,
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // non-JSON
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
