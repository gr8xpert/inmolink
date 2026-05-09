/**
 * Password hashing — Argon2id per PLAN §11.9 / ADR 0001.
 * OWASP recommendation as of 2025+: m=19456, t=2, p=1, length=32, version=19.
 *
 * Uses dynamic `import()` so webpack treats `@node-rs/argon2` as a runtime
 * boundary and doesn't try to bundle the .node binary into Server Component
 * graphs that don't actually call these functions. Only the routes/actions
 * that hit hashPassword/verifyPassword pay the import cost.
 */

const ARGON2_OPTS = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  const { hash } = await import("@node-rs/argon2");
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const { verify } = await import("@node-rs/argon2");
    return await verify(stored, plain);
  } catch {
    // Malformed hash, missing version, etc. Treat as failed verification.
    return false;
  }
}
