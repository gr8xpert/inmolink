import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM helpers for secrets at rest (PLAN §9.3).
 *
 * Storage format (text column): `<iv-hex>:<ciphertext-hex>:<authTag-hex>`.
 * IV is 12 bytes per NIST SP 800-38D. Auth tag is 16 bytes (GCM default).
 *
 * Used by:
 *   - TOTP secrets (UserSettings.totpSecretEnc)
 *   - Recovery codes (UserSettings.totpRecoveryCodesEnc — JSON-encoded)
 *   - Future: SMTP creds, Stripe keys, import credentials, webhook secrets
 *
 * Key is 32 raw bytes; pass the hex-encoded form from env and decode with
 * `Buffer.from(env.ENCRYPTION_KEY, "hex")` at the call site.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptToString(plain: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 raw bytes");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptFromString(blob: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 raw bytes");
  }
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted blob");
  }
  const [ivHex, ctHex, tagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Corrupt encrypted blob");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
