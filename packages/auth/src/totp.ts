import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless TOTP (RFC 6238) implementation. SHA-1, 6 digits, 30s step.
 *
 * Pure Node crypto — no external dep. The standard is small enough that
 * pulling in a library isn't worth the supply-chain footprint, especially
 * since the only consumers here are sign-in + the enrollment flow.
 *
 * Skew tolerance: ±1 step (so the user has 30–60 s window after their
 * authenticator displays a code).
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const RFC_4648_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type TotpSecret = { base32: string; bytes: Buffer };

/** Generate a fresh 20-byte (160-bit) TOTP secret. */
export function generateSecret(): TotpSecret {
  const bytes = randomBytes(20);
  return { base32: encodeBase32(bytes), bytes };
}

export function decodeSecret(base32: string): Buffer {
  return decodeBase32(base32);
}

/** Build an `otpauth://totp/...` provisioning URL per Google Auth spec. */
export function otpauthUrl(args: {
  secret: TotpSecret;
  account: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${args.issuer}:${args.account}`);
  const params = new URLSearchParams({
    secret: args.secret.base32,
    issuer: args.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Verify a 6-digit code with ±1 step skew tolerance. */
export function verifyCode(secret: Buffer, code: string, now = Date.now()): boolean {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const expected = computeCode(secret, counter + offset);
    if (constantTimeStringEqual(expected, trimmed)) return true;
  }
  return false;
}

/** Generate N user-facing recovery codes in `xxxx-xxxx-xxxx` format. */
export function generateRecoveryCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = randomBytes(2).toString("hex");
    const b = randomBytes(2).toString("hex");
    const c = randomBytes(2).toString("hex");
    out.push(`${a}-${b}-${c}`);
  }
  return out;
}

// -------- internals --------

function computeCode(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Big-endian 64-bit counter. JS bitwise is 32-bit only — split high/low.
  const high = Math.floor(counter / 0x1_0000_0000);
  const low = counter >>> 0;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  // Dynamic truncation per RFC 4226 §5.3.
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let out = "";
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RFC_4648_BASE32[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += RFC_4648_BASE32[(buffer << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(s: string): Buffer {
  const cleaned = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const v = RFC_4648_BASE32.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}
