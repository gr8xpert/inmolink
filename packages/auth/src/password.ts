import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing — Argon2id per PLAN §11.9 / ADR 0001.
 * OWASP recommendation as of 2025+: m=19456, t=2, p=1, length=32, version=19.
 */
const ARGON2_OPTS = {
  // Memory cost in KiB
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    // Malformed hash, missing version, etc. Treat as failed verification.
    return false;
  }
}
