import { handlers } from "@inmolink/auth";

// Auth.js v5 catch-all handler — exposes /api/auth/* endpoints (signin,
// signout, callback, csrf, session, providers).
export const { GET, POST } = handlers;

// We're not using Edge runtime because the auth flow needs Prisma access.
export const runtime = "nodejs";
