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

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Parent cookie domain for cross-subdomain session sharing.
 *
 * In production the dashboard runs on `app.inmolink.eu` and the api on
 * `api.inmolink.eu`. If the session cookie is host-only, the browser never
 * sends it to the api host and Socket.io auth + dashboard fetches break.
 *
 * Set AUTH_COOKIE_DOMAIN to the eTLD+1 (e.g. `.inmolink.eu`) for prod. Leave
 * unset for localhost so browsers accept a host-only cookie.
 */
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/sign-in",
  },
  // Pinned cookie config (defense-in-depth — Auth.js v5 defaults match
  // these today, but explicit pinning prevents an upstream default change
  // from silently weakening the session cookie).
  cookies: {
    sessionToken: {
      name: IS_PROD ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PROD,
        path: "/",
        // `__Secure-` prefix forbids cookies bound to a domain without `secure`,
        // which we already set above. Domain must include leading dot for
        // cross-subdomain sharing on legacy clients; modern browsers accept
        // either form.
        ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
      },
    },
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
