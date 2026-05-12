import { cn } from "@inmolink/ui";
import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Set true to opt out of inner padding (e.g. for tables that own it). */
  flush?: boolean;
  children: ReactNode;
};

/**
 * Section card used for tables, forms, lists, charts. Optional header row
 * with title + actions, optional sticky footer (e.g. "View all" link).
 */
export function SurfaceCard({
  title,
  description,
  actions,
  footer,
  className,
  flush,
  children,
}: Props) {
  const hasHeader = title || description || actions;
  return (
    <section className={cn("surface", className)}>
      {hasHeader ? (
        <header className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? "" : "p-5")}>{children}</div>
      {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
    </section>
  );
}
