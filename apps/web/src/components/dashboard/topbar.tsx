import { LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { NotificationBell } from "./notification-bell";

type Props = {
  locale: string;
  userName: string;
  userRole: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
  logoutAction: () => Promise<void>;
  /** Optional right-side action area for page-specific buttons. */
  actions?: ReactNode;
};

/**
 * Topbar — sticky, flat, frosted. Page titles live in `page-header.tsx`
 * inside the content column, so the bar stays minimal.
 *
 * The notification bell does its own client-side fetch (see
 * `notification-bell.tsx`) so the parent layout's server render doesn't
 * pay a round-trip to the api on every dashboard navigation.
 */
export function Topbar({ locale, userName, userRole, logoutAction, actions }: Props) {
  const initials = getInitials(userName);
  const roleLabel = ROLE_LABEL[userRole];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-border bg-card/70 px-5 backdrop-blur-md supports-[backdrop-filter]:bg-card/55">
      <div className="flex-1" />
      {actions}

      {userRole === "SUPER_ADMIN" && (
        <span className="hidden items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" />
          Super admin
        </span>
      )}

      <NotificationBell locale={locale} />

      <div className="flex items-center gap-2 border border-border bg-card pl-1 pr-2.5 py-1 shadow-sm">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="hidden text-[12px] leading-tight sm:block">
          <div className="font-medium">{userName}</div>
          <div className="text-[10px] text-muted-foreground">{roleLabel}</div>
        </div>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
