"use client";

import { cn } from "@inmolink/ui";
import { Building2, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup, NavItem } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

type Props = {
  locale: string;
  groups: ReadonlyArray<NavGroup>;
  agencyName: string;
};

/**
 * Mobile drawer — shown only below `md`. Reuses the same nav config the
 * desktop sidebar renders; auto-closes on route change.
 */
export function MobileNav({ locale, groups, agencyName }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const localePrefix = `/${locale}`;
  const localeRel = pathname.startsWith(localePrefix)
    ? pathname.slice(localePrefix.length)
    : pathname;

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger we want to re-run on, not a value the body reads.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            aria-modal="true"
            aria-label="Sidebar"
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-sidebar-foreground">
                    Inmolink
                  </div>
                  <div className="truncate text-xs text-sidebar-muted">{agencyName}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {groups.map((group) => (
                <div key={group.label} className="mb-6 last:mb-0">
                  <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                    {group.label}
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <MobileLink
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
        </div>
      ) : null}
    </>
  );
}

function MobileLink({
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
