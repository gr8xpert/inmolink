import type { PlanTier } from "@inmolink/shared";

const STYLES: Record<PlanTier, string> = {
  FREE: "bg-muted text-foreground",
  PRO: "bg-emerald-600 text-white",
  BUSINESS: "bg-blue-600 text-white",
  ENTERPRISE: "bg-violet-600 text-white",
};

export function PlanBadge({ tier }: { tier: PlanTier }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLES[tier]}`}
    >
      {tier}
    </span>
  );
}
