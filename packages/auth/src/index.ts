/**
 * Auth package — Auth.js v5 wiring + permission helpers (Node runtime entry).
 *
 * For Edge runtime (middleware), import from `@inmolink/auth/edge` instead —
 * that entry point avoids Prisma + Argon2 native deps.
 */
export { auth, handlers, signIn, signOut } from "./auth";
export { authConfig } from "./auth.config";
export { AuthError, CredentialsSignin } from "next-auth";
export * from "./can";
export * from "./crypto";
export * from "./password";
export * from "./totp";
