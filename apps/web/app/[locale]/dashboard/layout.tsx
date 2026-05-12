import { MobileNav } from "@/components/dashboard/mobile-nav";
import { NAV_GROUPS, filterNavGroupsByRole } from "@/components/dashboard/nav-config";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { apiFetch } from "@/lib/api";
import { auth, signOut } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { notificationSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  params: Promise<{ locale: string }>;
  children: ReactNode;
};

/**
 * Dashboard shell — wraps every page under `/[locale]/dashboard/...` in a
 * sticky sidebar + topbar. Authentication enforced here, so individual page
 * components can assume `auth()` returns a session.
 *
 * Server-side filters the nav by role and resolves the agency name once per
 * navigation. Pages still own their own data fetching.
 */
export default async function DashboardLayout({ params, children }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  // Agency name for the sidebar header — falls back to role label when the
  // user belongs to no agency (super-admin standalone).
  const agencyName = session.user.agencyId
    ? ((
        await prisma.agency.findUnique({
          where: { id: session.user.agencyId },
          select: { name: true },
        })
      )?.name ?? "Inmolink")
    : "Inmolink";

  // Unread notification badge — soft-fail so a temporary api hiccup never
  // takes down the whole dashboard.
  let unreadCount = 0;
  try {
    const r = await apiFetch<notificationSchemas.NotificationListResponse>(
      "/api/dashboard/notifications?limit=1",
    );
    unreadCount = r.unreadCount;
  } catch {
    // ignored
  }

  const groups = filterNavGroupsByRole(NAV_GROUPS, session.user.role);

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: `/${locale}/sign-in` });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar locale={locale} groups={groups} agencyName={agencyName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          {/* Mobile drawer + trigger — hidden on desktop where Sidebar is sticky. */}
        </div>
        <Topbar
          locale={locale}
          userName={session.user.name}
          userRole={session.user.role}
          unreadCount={unreadCount}
          logoutAction={logoutAction}
          actions={<MobileNav locale={locale} groups={groups} agencyName={agencyName} />}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
