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
 * Compact stat tile — label/value left, icon chip right. Lifts on hover and
 * fades in on mount. Tone controls the icon chip only so the headline number
 * always stays foreground-strong.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = "primary" }: Props) {
  return (
    <div className="surface surface-interactive group relative flex items-start justify-between gap-3 overflow-hidden p-4 animate-fade-in-up">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          TONE_BAR[tone],
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </div>
        {hint ? <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div> : null}
      </div>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-110",
          TONE_BG[tone],
        )}
      >
        <Icon className={cn("h-4 w-4", TONE_FG[tone])} />
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

const TONE_BAR = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
} as const;
