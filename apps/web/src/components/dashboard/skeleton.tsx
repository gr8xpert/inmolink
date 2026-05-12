import { cn } from "@inmolink/ui";

/**
 * Animated placeholder bar. Pulses while the server component upstream is
 * fetching data. No fancy shimmer — `animate-pulse` is built into Tailwind
 * and ships zero extra CSS.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
}

/**
 * Generic dashboard page placeholder. Mirrors the visual structure most
 * pages share — header row + 4 stat tiles + a list card. Looks vaguely
 * right for the home, every list page, and most settings pages without
 * being so detailed that the swap-in is jarring.
 */
export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl" aria-label="Loading">
      {/* Page header */}
      <div className="mb-6 flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Optional stat row — visible only on wider viewports so we don't
          mock up four tiles for a narrow form-style page. */}
      <div className="mb-6 hidden grid-cols-4 gap-4 lg:grid">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional skeleton placeholder, no real id.
          <div key={i} className="surface flex items-start gap-4 p-5">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* List body */}
      <div className="surface">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-32" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional skeleton placeholder.
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
