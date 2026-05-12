import { cn } from "@inmolink/ui";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

type Props = {
  label: string;
  tone?: Tone;
  className?: string;
};

/**
 * Pill badge used on list rows, detail headers, and inline stats. Tone
 * picker keeps the call site readable: callers don't repeat the same
 * bg/text-color permutation 40 times across the dashboard.
 */
export function StatusBadge({ label, tone = "neutral", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/**
 * Centralised status → tone map. Add new statuses here; pages just import
 * `toneForStatus(status)` and never hand-pick colors.
 */
const STATUS_TONE: Record<string, Tone> = {
  // Property
  DRAFT: "neutral",
  ACTIVE: "success",
  UNDER_OFFER: "warning",
  SOLD: "info",
  RENTED: "info",
  WITHDRAWN: "danger",
  // Viewing
  PENDING: "warning",
  ACCEPTED: "success",
  DECLINED: "danger",
  RESCHEDULED: "info",
  CANCELLED: "neutral",
  COMPLETED: "info",
  EXPIRED: "neutral",
  // Deal
  PENDING_BOTH: "warning",
  PENDING_OWNER: "warning",
  PENDING_INTRODUCER: "warning",
  CONFIRMED: "success",
  DISPUTED: "danger",
  // Visibility
  PUBLIC: "success",
  SHARED: "info",
  PRIVATE: "neutral",
  // Import / job
  PROCESSING: "warning",
  SUCCESS: "success",
  FAILED: "danger",
  // Ticket
  OPEN: "warning",
  IN_PROGRESS: "info",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export function toneForStatus(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}
