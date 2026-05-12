import { cn } from "@inmolink/ui";
import type { ComponentType, ReactNode } from "react";

type Tone = "primary" | "success" | "warning" | "danger" | "info";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
};

/**
 * Big-number tile for the dashboard home + section overview rows. Tone
 * controls the icon chip color only — body text stays foreground for
 * readability.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = "primary" }: Props) {
  return (
    <div className="surface flex items-start gap-4 p-5">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          TONE_BG[tone],
        )}
      >
        <Icon className={cn("h-5 w-5", TONE_FG[tone])} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}

const TONE_BG = {
  primary: "bg-primary-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  info: "bg-info-soft",
} as const;

const TONE_FG = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
} as const;
