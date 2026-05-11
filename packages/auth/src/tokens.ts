import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed compact tokens used by Sprint 8 email tracking endpoints.
 *
 * Format: `<base64url(payloadJson)>.<base64url(hmac)>`
 *
 * Payload includes a `kind` discriminator so the same signing key can drive
 * tracking pixel / click / unsubscribe flows without collision. The token is
 * stable per recipient — no rotation, no expiry — because the recipient row
 * itself controls validity (deleted recipient → 404 from the route handler).
 *
 * Re-uses the api's ENCRYPTION_KEY as the HMAC secret (32 bytes is plenty);
 * a dedicated TRACKING_SECRET would be ideal but adding another env var is
 * needless friction for the same trust boundary.
 */

export type TrackingTokenKind = "open" | "click" | "unsubscribe";

export type TrackingTokenPayload = {
  k: TrackingTokenKind;
  r: string; // recipientId
  u?: string; // signed destination URL — required for click tokens to prevent open-redirect abuse
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signTrackingToken(payload: TrackingTokenPayload, secretHex: string): string {
  const key = Buffer.from(secretHex, "hex");
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", key).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifyTrackingToken(token: string, secretHex: string): TrackingTokenPayload | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  const key = Buffer.from(secretHex, "hex");
  const expected = createHmac("sha256", key).update(body).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as TrackingTokenPayload;
    if (!payload?.r || !payload?.k) return null;
    return payload;
  } catch {
    return null;
  }
}
