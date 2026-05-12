import { cn } from "@inmolink/ui";
import Link from "next/link";
import type { ComponentType } from "react";

type Props = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
  className?: string;
};

/** Empty state shown inside SurfaceCard when a list has zero rows. */
export function EmptyState({ icon: Icon, title, description, cta, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-2 inline-flex items-center gap-1.5 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_6px_16px_rgba(37,99,235,0.25)] active:scale-[0.97]"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
