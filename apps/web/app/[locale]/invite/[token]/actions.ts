"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { signIn } from "@inmolink/auth";
import type { inviteSchemas } from "@inmolink/shared";

type Result =
  | { ok: true; userId: string; agencyId: string }
  | { ok: false; status?: number; error: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Anonymous accept — creates a new User account from the invite. The api
 * keeps the email server-side; the client only sends name + password.
 *
 * Bypasses the cookie-forwarding apiFetch wrapper because this call is
 * intentionally unauthenticated (the user has no session yet). After the
 * api returns the new user id we sign them in via NextAuth Credentials
 * provider so the session cookie is set before the redirect to dashboard.
 */
export async function acceptInviteNewAction(
  token: string,
  input: inviteSchemas.InviteAcceptNewInput,
): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/public/invites/${encodeURIComponent(token)}/accept-new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
  const body = (await res.json().catch(() => null)) as
    | { userId: string; agencyId: string }
    | { error?: string; message?: string }
    | null;
  if (!res.ok) {
    const msg = (body && "message" in body && body.message) || "Could not accept invitation";
    return { ok: false, status: res.status, error: msg };
  }
  if (!body || !("userId" in body)) {
    return { ok: false, status: res.status, error: "Empty response" };
  }
  return { ok: true, userId: body.userId, agencyId: body.agencyId };
}

/**
 * Authed accept — the current session's email is matched against the
 * invite. apiFetch forwards the cookie automatically.
 */
export async function acceptInviteExistingAction(token: string): Promise<Result> {
  try {
    const out = await apiFetch<{ userId: string; agencyId: string }>(
      `/api/public/invites/${encodeURIComponent(token)}/accept-existing`,
      { method: "POST" },
    );
    return { ok: true, userId: out.userId, agencyId: out.agencyId };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

/**
 * After a successful new-user accept, sign them in with the password they
 * just set so the dashboard redirect works without a re-prompt.
 */
export async function signInAfterAcceptAction(
  email: string,
  password: string,
  redirectTo: string,
): Promise<void> {
  await signIn("credentials", { email, password, redirectTo });
}
