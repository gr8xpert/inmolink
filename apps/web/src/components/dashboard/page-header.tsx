import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

/**
 * Page header — title left, actions right. Animates in on mount so each
 * route transition feels alive.
 */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between animate-fade-in-up">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
