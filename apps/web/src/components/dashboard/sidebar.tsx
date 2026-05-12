"use client";

import { cn } from "@inmolink/ui";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup, NavItem } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

type Props = {
  locale: string;
  groups: ReadonlyArray<NavGroup>;
  agencyName: string;
};

/**
 * Sticky left sidebar — full height, dark navy surface. Active state matches
 * the current route by prefix so `/dashboard/properties/123/edit` keeps the
 * "Properties" link highlighted. We intentionally compare on locale-relative
 * paths (strip `/<locale>` prefix) to keep the nav config locale-agnostic.
 */
export function Sidebar({ locale, groups, agencyName }: Props) {
  const pathname = usePathname();
  const localePrefix = `/${locale}`;
  const localeRel = pathname.startsWith(localePrefix)
    ? pathname.slice(localePrefix.length)
    : pathname;

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-sidebar-foreground">Inmolink</div>
          <div className="truncate text-xs text-sidebar-muted">{agencyName}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  locale={locale}
                  active={isActive(item.href, localeRel)}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  locale,
  active,
}: {
  item: NavItem;
  locale: string;
  active: boolean;
}) {
  const Icon = NAV_ICONS[item.iconKey];
  return (
    <li>
      <Link
        href={`/${locale}${item.href}`}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-active text-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-hover",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "text-sidebar-muted")} />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function isActive(href: string, current: string): boolean {
  if (href === "/dashboard") return current === "/dashboard";
  return current === href || current.startsWith(`${href}/`);
}
