import type { UserRole } from "@inmolink/shared";
import { createAdapter } from "@socket.io/redis-adapter";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { decode } from "next-auth/jwt";
import { Server } from "socket.io";

/**
 * Socket.io server attached to the Fastify HTTP server (PLAN §11.8).
 *
 * - Auth: reuses the Auth.js v5 session cookie, decoded with the same
 *   `AUTH_SECRET` as the REST plugin in `plugins/auth.ts`. No app token needed.
 * - Adapter: `@socket.io/redis-adapter` with two dedicated Redis connections
 *   (pub + sub). Single VPS today, multi-instance later with zero code change.
 * - Rooms: each connection is auto-joined to `user:<userId>` so server-side
 *   notification fanout is `io.to('user:<id>').emit(...)`. Chat threads use
 *   `thread:<threadId>` joined via the `chat:thread:join` event after the
 *   server confirms the user is a participant.
 */

export type AuthedSocketUser = {
  id: string;
  role: UserRole;
  agencyId: string | null;
};

type ServerToClientEvents = Record<string, never>;
type ClientToServerEvents = Record<string, never>;
type InterServerEvents = Record<string, never>;
export type SocketData = { user: AuthedSocketUser };
export type AppIOServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const COOKIE_CANDIDATES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    out[name] = decodeURIComponent(valueParts.join("="));
  }
  return out;
}

export function installSocketIO(
  app: FastifyInstance,
  opts: {
    redis: Redis;
    authSecret: string;
    corsOrigins: readonly string[];
  },
): AppIOServer {
  const io: AppIOServer = new Server(app.server, {
    path: "/socket.io",
    serveClient: false,
    cors: {
      origin: [...opts.corsOrigins],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Pub/sub adapter — separate dedicated connections per the Redis adapter docs.
  const pub = opts.redis.duplicate();
  const sub = opts.redis.duplicate();
  io.adapter(createAdapter(pub, sub));

  // Auth middleware — runs on every connection. Reject if cookie absent or
  // signature mismatch. The decoded payload mirrors the REST hook.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      for (const name of COOKIE_CANDIDATES) {
        const token = cookies[name];
        if (!token) continue;
        const payload = await decode({ token, secret: opts.authSecret, salt: name });
        if (!payload?.userId) continue;
        socket.data.user = {
          id: payload.userId as string,
          role: (payload.role as UserRole) ?? "AGENT",
          agencyId: (payload.agencyId as string | null) ?? null,
        };
        return next();
      }
      return next(new Error("UNAUTHENTICATED"));
    } catch (_err) {
      return next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const u = socket.data.user;
    // Per-user room — used by notification fanout and unicast events.
    socket.join(`user:${u.id}`);
    app.log.info({ socketId: socket.id, userId: u.id }, "socket connected");

    socket.on("disconnect", (reason) => {
      app.log.debug({ socketId: socket.id, userId: u.id, reason }, "socket disconnected");
    });
  });

  app.addHook("onClose", async () => {
    await io.close();
    pub.disconnect();
    sub.disconnect();
  });

  return io;
}
