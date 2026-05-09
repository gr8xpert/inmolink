import { prisma } from "@inmolink/db";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./password";

/**
 * Full Auth.js config — extends edge-safe authConfig with the Credentials
 * provider's authorize callback (which needs Prisma + Argon2). Used by the
 * route handler at apps/web/app/api/auth/[...nextauth]/route.ts and by
 * Server Components / Server Actions.
 *
 * Edge runtime (middleware) imports from `./edge.js` instead.
 */

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCreds) {
        const parsed = credentialsSchema.safeParse(rawCreds);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;
        if (!user.isActive) return null;
        if (!user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Returned object becomes the `user` argument in the jwt callback.
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          role: user.role,
          agencyId: user.agencyId,
        };
      },
    }),
  ],
});
