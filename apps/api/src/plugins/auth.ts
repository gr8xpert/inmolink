import type { UserRole } from "@inmolink/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { decode } from "next-auth/jwt";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    requireUser(): AuthenticatedUser;
    requireSuperAdmin(): AuthenticatedUser;
  }
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  agencyId: string | null;
};

type InstallAuthOptions = {
  secret: string;
};

/**
 * Installs auth hook + helpers on the passed app.
 *
 * Implemented as a plain function (not a Fastify plugin) so we don't have to
 * deal with fastify-plugin's no-exports ESM interop quirks under tsx — and
 * because the decorations are needed at the root level anyway (no
 * encapsulation needed).
 *
 * Parses the Auth.js v5 session cookie set by apps/web and attaches `user`
 * to every request when valid. Routes call `request.requireUser()` to 401
 * on missing auth.
 *
 * Cookie names per Auth.js v5 conventions:
 *   - HTTP dev:    `authjs.session-token`
 *   - HTTPS prod:  `__Secure-authjs.session-token`
 *
 * The `salt` argument to decode() must match the cookie name.
 */
export function installAuth(app: FastifyInstance, opts: InstallAuthOptions): void {
  const { secret } = opts;

  app.decorateRequest("requireUser", function (this: FastifyRequest) {
    if (!this.user) {
      const err = new Error("Authentication required") as Error & {
        statusCode: number;
        code: string;
      };
      err.statusCode = 401;
      err.code = "UNAUTHENTICATED";
      throw err;
    }
    return this.user;
  });

  // requireSuperAdmin — gate for /api/dashboard/admin/* taxonomy curation
  // routes. 401 if no session, 403 if signed in as non-super-admin. Keeps
  // role checks out of every individual route handler.
  app.decorateRequest("requireSuperAdmin", function (this: FastifyRequest) {
    const user = this.requireUser();
    if (user.role !== "SUPER_ADMIN") {
      const err = new Error("Super-admin role required") as Error & {
        statusCode: number;
        code: string;
      };
      err.statusCode = 403;
      err.code = "SUPER_ADMIN_REQUIRED";
      throw err;
    }
    return user;
  });

  app.addHook("preHandler", async (request) => {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return;

    const cookies = parseCookies(cookieHeader);
    const candidates: Array<[string, string]> = [];
    const dev = cookies["authjs.session-token"];
    const prod = cookies["__Secure-authjs.session-token"];
    if (dev) candidates.push(["authjs.session-token", dev]);
    if (prod) candidates.push(["__Secure-authjs.session-token", prod]);

    for (const [salt, token] of candidates) {
      try {
        const payload = await decode({ token, secret, salt });
        if (!payload?.userId) continue;
        request.user = {
          id: payload.userId as string,
          email: (payload.email as string) ?? "",
          role: (payload.role as UserRole) ?? "AGENT",
          agencyId: (payload.agencyId as string | null) ?? null,
        };
        return;
      } catch {
        // try next, fall through to no-user
      }
    }
  });
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    out[name] = decodeURIComponent(valueParts.join("="));
  }
  return out;
}
