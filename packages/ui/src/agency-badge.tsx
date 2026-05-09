import { cn } from "./cn";

/**
 * AgencyBadge — small mandatory badge shown on every property surface
 * (cards, detail, exports, emails) per PLAN §1 row 4. Multi-agent
 * marketplace policy: clients must always see who's listing what.
 *
 * Server Component-safe — pure JSX, no hooks, no client-only APIs.
 */

type AgencyBadgeProps = {
  name: string;
  logoUrl?: string | null;
  href?: string;
  /** Visual size — "sm" for cards, "md" for detail headers. */
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASSES = {
  sm: { wrapper: "h-6 text-xs", logo: "h-5 w-5", padding: "px-2" },
  md: { wrapper: "h-8 text-sm", logo: "h-6 w-6", padding: "px-3" },
} as const;

export function AgencyBadge({ name, logoUrl, href, size = "sm", className }: AgencyBadgeProps) {
  const sz = SIZE_CLASSES[size];
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-muted/50",
        sz.wrapper,
        sz.padding,
        className,
      )}
    >
      {logoUrl ? (
        // Plain <img> rather than next/image so this component stays portable
        // across web, public, and any future SSR consumer without coupling
        // to Next.js's Image component.
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className={cn("rounded-full object-cover", sz.logo)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary",
            sz.logo,
          )}
        >
          {name.charAt(0)}
        </span>
      )}
      <span className="truncate font-medium">{name}</span>
    </span>
  );

  if (href) {
    return (
      <a href={href} className="inline-block hover:opacity-90">
        {content}
      </a>
    );
  }
  return content;
}
