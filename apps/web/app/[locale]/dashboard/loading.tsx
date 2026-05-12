import { DashboardPageSkeleton } from "@/components/dashboard/skeleton";

/**
 * Catch-all loading state for every route under /[locale]/dashboard/...
 * Next.js renders this instantly when the user navigates, then swaps the
 * real server-rendered content in when the upstream fetch resolves.
 *
 * The shell (sidebar + topbar) stays mounted across the swap because it
 * lives in `layout.tsx` — only the main content area shows the placeholder.
 */
export default function DashboardLoading() {
  return <DashboardPageSkeleton />;
}
