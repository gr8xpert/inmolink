import { Bell, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  locale: string;
  userName: string;
  userRole: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
  unreadCount: number;
  logoutAction: () => Promise<void>;
  /** Optional right-side action area for page-specific buttons. */
  actions?: ReactNode;
};

/**
 * Topbar — sticks below the screen edge, sits above all main content. Page
 * titles live in `page-header.tsx` (in the content column) so the topbar
 * stays uncluttered and consistent across every route.
 */
export function Topbar({ locale, userName, userRole, unreadCount, logoutAction, actions }: Props) {
  const initials = getInitials(userName);
  const roleLabel = ROLE_LABEL[userRole];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="flex-1" />
      {actions}

      {userRole === "SUPER_ADMIN" && (
        <span className="hidden items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" />
          Super admin
        </span>
      )}

      <Link
        href={`/${locale}/dashboard/notifications`}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          {initials}
        </div>
        <div className="hidden text-sm leading-tight sm:block">
          <div className="font-medium">{userName}</div>
          <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
        </div>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </header>
  );
}

const ROLE_LABEL = {
  SUPER_ADMIN: "Super admin",
  AGENCY_ADMIN: "Agency admin",
  AGENT: "Agent",
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
