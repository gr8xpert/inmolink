import { apiFetch } from "@/lib/api";
import { auth, signOut } from "@inmolink/auth";
import type { notificationSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  async function logout() {
    "use server";
    await signOut({ redirectTo: `/${locale}/sign-in` });
  }

  // Notification badge — soft-fail if api temporarily down so the dashboard
  // remains usable.
  let unreadCount = 0;
  try {
    const r = await apiFetch<notificationSchemas.NotificationListResponse>(
      "/api/dashboard/notifications?limit=1",
    );
    unreadCount = r.unreadCount;
  } catch {
    // ignored
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.name} ({session.user.role})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/dashboard/notifications`}
            className="relative rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            🔔 Notifications
            {unreadCount > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <form action={logout}>
            <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/${locale}/dashboard/properties`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Properties</h2>
          <p className="text-sm text-muted-foreground">
            Browse + manage listings (your own and the agency&apos;s shared inventory).
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/imports`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Imports</h2>
          <p className="text-sm text-muted-foreground">
            Connect a Kyero, Resale Online, or generic XML feed; the worker syncs on schedule.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/viewings`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Viewings</h2>
          <p className="text-sm text-muted-foreground">
            Requests to visit listings, with encrypted client info and chat threads per request.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/deals`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Deals</h2>
          <p className="text-sm text-muted-foreground">
            Commission handshakes between listing agent and introducer. Both must confirm.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/chat`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Chat</h2>
          <p className="text-sm text-muted-foreground">
            Live conversations with other agents — viewing-bound or direct.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/settings`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Profile, password, notification preferences, two-factor auth.
          </p>
        </Link>

        {session.user.agencyId && session.user.role !== "AGENT" && (
          <Link
            href={`/${locale}/dashboard/agency`}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">Agency</h2>
            <p className="text-sm text-muted-foreground">
              Branding, contact, public profile, team invites.
            </p>
          </Link>
        )}

        {session.user.agencyId && session.user.role !== "AGENT" && (
          <Link
            href={`/${locale}/dashboard/billing`}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">Billing</h2>
            <p className="text-sm text-muted-foreground">
              Subscription, invoices, VAT details. Upgrade to PRO to unlock public listings.
            </p>
          </Link>
        )}

        {session.user.agencyId && session.user.role !== "AGENT" && (
          <Link
            href={`/${locale}/dashboard/marketing`}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">Marketing</h2>
            <p className="text-sm text-muted-foreground">
              Email templates + campaigns + contacts + suppressions. PRO plan required.
            </p>
          </Link>
        )}

        <Link
          href={`/${locale}/dashboard/tickets`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Support tickets</h2>
          <p className="text-sm text-muted-foreground">
            Open a ticket for bugs, billing, or account questions. Threaded conversation with
            super-admin.
          </p>
        </Link>

        {session.user.agencyId && (
          <Link
            href={`/${locale}/dashboard/exports`}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">Exports</h2>
            <p className="text-sm text-muted-foreground">
              CSV inventory + PDF brochures / portfolio. Files expire 7 days after generation. PRO
              plan required.
            </p>
          </Link>
        )}

        {session.user.role === "SUPER_ADMIN" && (
          <Link
            href={`/${locale}/dashboard/admin`}
            className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
          >
            <h2 className="font-semibold">Admin</h2>
            <p className="text-sm text-muted-foreground">
              Curate property types, features, and locations. Super-admin only.
            </p>
          </Link>
        )}
      </section>

      <section className="space-y-2 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Session debug:</p>
        <pre className="overflow-x-auto">{JSON.stringify(session, null, 2)}</pre>
      </section>
    </main>
  );
}
