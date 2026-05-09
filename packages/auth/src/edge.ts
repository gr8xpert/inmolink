import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Edge-runtime Auth.js export. Used ONLY by middleware.ts.
 *
 * This entry point must not transitively import Prisma or @node-rs/argon2.
 * If you need to validate credentials in middleware, that's a sign you should
 * be doing it in an API route instead.
 */
export const { auth: middlewareAuth } = NextAuth(authConfig);
