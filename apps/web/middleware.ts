import { middlewareAuth } from "@inmolink/auth/edge";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./src/i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Compose: Auth.js (edge-safe variant) reads the JWT cookie and runs the
// `authorized` callback to gate routes; next-intl handles locale routing
// for allowed requests.
//
// IMPORTANT: middleware imports from `@inmolink/auth/edge`, NOT
// `@inmolink/auth`, so we don't pull Prisma / Argon2 native deps into the
// Edge bundle (Auth.js v5 split-config pattern).
export default middlewareAuth((req) => {
  return intlMiddleware(req as unknown as NextRequest);
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
