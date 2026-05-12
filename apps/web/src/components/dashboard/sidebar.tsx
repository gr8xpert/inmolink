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
 * Sticky left sidebar — full height, light slate surface, flat edges.
 * Active state matches the current route by prefix so deep links keep their
 * top-level item highlighted. Compared on locale-relative paths to stay
 * locale-agnostic.
 */
export function Sidebar({ locale, groups, agencyName }: Props) {
  const pathname = usePathname();
  const localePrefix = `/${locale}`;
  const localeRel = pathname.startsWith(localePrefix)
    ? pathname.slice(localePrefix.length)
    : pathname;

  return (
    <aside className="surface-sidebar hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-sidebar-border md:backdrop-blur-sm animate-slide-in-left">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground shadow-sm">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
            Inmolink
          </div>
          <div className="truncate text-[11px] text-sidebar-muted">{agencyName}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {groups.map((group, gi) => (
          <div
            key={group.label}
            className="mb-4 last:mb-0 animate-fade-in-up"
            style={{ animationDelay: `${gi * 40}ms` }}
          >
            <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">
              {group.label}
            </div>
            <ul className="space-y-px">
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
          "group relative flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] transition-all duration-200",
          active
            ? "bg-sidebar-active text-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-hover hover:translate-x-0.5",
        )}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-primary-foreground/80" />
        ) : null}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "" : "text-sidebar-muted group-hover:text-sidebar-foreground",
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function isActive(href: string, current: string): boolean {
  if (href === "/dashboard") return current === "/dashboard";
  return current === href || current.startsWith(`${href}/`);
}
