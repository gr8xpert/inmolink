/**
 * Icon keys — narrowed to a closed set so the client-side resolver in
 * sidebar.tsx + mobile-nav.tsx can type-check the lookup table. Functions
 * cannot cross the server → client component boundary in Next 15, so we
 * pass string keys and let the client map them to Lucide components.
 */
export type IconKey =
  | "activity"
  | "bell"
  | "building2"
  | "calendar-check"
  | "credit-card"
  | "file-bar-chart"
  | "file-spreadsheet"
  | "handshake"
  | "home"
  | "inbox"
  | "key-round"
  | "layout-grid"
  | "life-buoy"
  | "map-pin"
  | "megaphone"
  | "receipt"
  | "settings"
  | "shield-check"
  | "sparkles"
  | "star"
  | "tag"
  | "user-cog"
  | "users"
  | "webhook";

export type NavItem = {
  /** Locale-relative path under `/[locale]/dashboard/...`. */
  href: string;
  label: string;
  iconKey: IconKey;
  /** Hide unless the signed-in user has at least one of these roles. */
  roles?: ReadonlyArray<"SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT">;
};

export type NavGroup = {
  label: string;
  items: ReadonlyArray<NavItem>;
};

/**
 * Inmolink-grouped sidebar nav. Order locked: high-touch sections (Overview,
 * Listings, Pipeline) at the top; admin + account scopes at the bottom. The
 * dashboard layout filters items by the user's role server-side, so AGENT
 * accounts never see ADMIN entries even in the DOM.
 */
export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", iconKey: "layout-grid" },
      { href: "/dashboard/notifications", label: "Notifications", iconKey: "bell" },
    ],
  },
  {
    label: "Listings",
    items: [
      { href: "/dashboard/properties", label: "Properties", iconKey: "home" },
      { href: "/dashboard/imports", label: "Imports", iconKey: "file-spreadsheet" },
      { href: "/dashboard/exports", label: "Exports", iconKey: "file-bar-chart" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/dashboard/viewings", label: "Viewings", iconKey: "calendar-check" },
      { href: "/dashboard/deals", label: "Deals", iconKey: "handshake" },
      { href: "/dashboard/chat", label: "Chat", iconKey: "inbox" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/dashboard/marketing", label: "Marketing", iconKey: "megaphone" },
      { href: "/dashboard/tickets", label: "Support", iconKey: "life-buoy" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/dashboard/admin", label: "Console", iconKey: "sparkles", roles: ["SUPER_ADMIN"] },
      {
        href: "/dashboard/admin/property-types",
        label: "Property types",
        iconKey: "tag",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/dashboard/admin/locations",
        label: "Locations",
        iconKey: "map-pin",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/dashboard/admin/featured-listings",
        label: "Featured listings",
        iconKey: "star",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/dashboard/admin/audit-log",
        label: "Audit log",
        iconKey: "activity",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/dashboard/admin/webhook-deliveries",
        label: "Webhook deliveries",
        iconKey: "webhook",
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/dashboard/agency",
        label: "Agency",
        iconKey: "building2",
        roles: ["AGENCY_ADMIN", "SUPER_ADMIN"],
      },
      {
        href: "/dashboard/agency/team",
        label: "Team",
        iconKey: "users",
        roles: ["AGENCY_ADMIN", "SUPER_ADMIN"],
      },
      { href: "/dashboard/billing", label: "Billing", iconKey: "credit-card" },
      { href: "/dashboard/settings/profile", label: "Profile", iconKey: "user-cog" },
      { href: "/dashboard/settings/two-factor", label: "Security", iconKey: "shield-check" },
      { href: "/dashboard/settings/preferences", label: "Preferences", iconKey: "settings" },
      { href: "/dashboard/settings/password", label: "Password", iconKey: "key-round" },
      {
        href: "/dashboard/agency/webhooks",
        label: "Webhooks",
        iconKey: "webhook",
        roles: ["AGENCY_ADMIN", "SUPER_ADMIN"],
      },
      {
        href: "/dashboard/agency/email-config",
        label: "Email config",
        iconKey: "receipt",
        roles: ["AGENCY_ADMIN", "SUPER_ADMIN"],
      },
    ],
  },
];

export function filterNavGroupsByRole(
  groups: ReadonlyArray<NavGroup>,
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT",
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0);
}
