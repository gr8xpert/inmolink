import { cn } from "@inmolink/ui";
import Link from "next/link";
import type { ComponentType } from "react";

type Props = {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  className?: string;
};

/** Tile used on every hub/landing page (Admin, Agency, Marketing, Settings). */
export function HubTile({ href, title, description, icon: Icon, className }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "surface surface-interactive group flex h-full flex-col gap-3 p-4 animate-fade-in-up",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center bg-primary-soft text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}
