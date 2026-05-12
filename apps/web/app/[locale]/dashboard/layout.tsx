import { MobileNav } from "@/components/dashboard/mobile-nav";
import { NAV_GROUPS, filterNavGroupsByRole } from "@/components/dashboard/nav-config";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { auth, signOut } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ReactNode } from "react";

type Props = {
  params: Promise<{ locale: string }>;
  children: ReactNode;
};

/**
 * Cached per-render — Next.js re-evaluates the layout on every navigation,
 * but within a single render the lookup is deduped. Agency name rarely
 * changes anyway; if this query ever becomes hot, swap for `unstable_cache`
 * with a tag invalidated on agency rename.
 */
const getAgencyName = cache(async (agencyId: string | null): Promise<string> => {
  if (!agencyId) return "Inmolink";
  const row = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { name: true },
  });
  return row?.name ?? "Inmolink";
});

/**
 * Dashboard shell — wraps every page under `/[locale]/dashboard/...` in a
 * sticky sidebar + topbar. Authentication enforced here, so individual page
 * components can assume `auth()` returns a session.
 *
 * Server-side filters the nav by role and resolves the agency name once per
 * navigation. The unread badge fetch lives in `NotificationBell` (client)
 * so the layout never blocks on a web→api round-trip — that's the dominant
 * source of perceived navigation latency in dev.
 */
export default async function DashboardLayout({ params, children }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  const agencyName = await getAgencyName(session.user.agencyId);
  const groups = filterNavGroupsByRole(NAV_GROUPS, session.user.role);

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: `/${locale}/sign-in` });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar locale={locale} groups={groups} agencyName={agencyName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          locale={locale}
          userName={session.user.name}
          userRole={session.user.role}
          logoutAction={logoutAction}
          actions={<MobileNav locale={locale} groups={groups} agencyName={agencyName} />}
        />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-7">{children}</main>
      </div>
    </div>
  );
}
