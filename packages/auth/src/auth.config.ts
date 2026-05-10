import { type UserRole, userRoleSchema } from "@inmolink/shared";
import type { NextAuthConfig } from "next-auth";
import "next-auth/jwt";

/**
 * Edge-safe Auth.js config.
 *
 * IMPORTANT: this file runs in BOTH Edge runtime (middleware) and Node runtime
 * (route handlers). It must NOT import:
 *   - Prisma (`@inmolink/db`) — uses Node-native binaries
 *   - `@node-rs/argon2` — native module
 *   - `verifyPassword` from `./password.js` (transitively imports argon2)
 *
 * The Credentials provider's `authorize` callback (which DOES need Prisma +
 * Argon2) is added in `./auth.ts` for the Node-runtime config.
 *
 * Pattern: https://authjs.dev/guides/edge-compatibility
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      agencyId: string | null;
    };
  }
  interface User {
    role: UserRole;
    agencyId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    agencyId?: string | null;
  }
}

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/sign-in",
  },
  // Providers added in auth.ts (Node runtime). Empty here so middleware can
  // still call `auth()` to read the JWT cookie without invoking authorize.
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.role = (user as { role: UserRole }).role;
        token.agencyId = (user as { agencyId: string | null }).agencyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.userId as string) ?? "";
        const parsedRole = userRoleSchema.safeParse(token.role);
        session.user.role = parsedRole.success ? parsedRole.data : "AGENT";
        session.user.agencyId = (token.agencyId as string | null) ?? null;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const stripped = path.replace(/^\/(en|es|de|fr)/, "") || "/";
      const isAuthPage = stripped === "/sign-in" || stripped === "/sign-up";
      const isPublicSurface =
        stripped === "/" ||
        stripped.startsWith("/buy/") ||
        stripped.startsWith("/property/") ||
        stripped.startsWith("/agency/") ||
        stripped.startsWith("/agent/") ||
        stripped.startsWith("/invite/") ||
        stripped.startsWith("/search");

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (isPublicSurface) return true;

      return isLoggedIn;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
