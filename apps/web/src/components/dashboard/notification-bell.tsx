"use client";

import { env } from "@/env";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 30_000;

type Props = {
  locale: string;
};

/**
 * Notification bell + unread badge. Lives in the topbar but fetches the
 * unread count on the CLIENT after mount instead of in the parent layout's
 * server component. That keeps the layout off the api's critical path so
 * every dashboard navigation stays snappy.
 *
 * Polls every 30s so the badge stays roughly fresh without a websocket.
 * Soft-fails on network errors — a flaky api shouldn't blank the bell.
 */
export function NotificationBell({ locale }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch(`${API_BASE}/api/dashboard/notifications?limit=1`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unreadCount?: number };
        if (!cancelled && typeof data.unreadCount === "number") {
          setCount(data.unreadCount);
        }
      } catch {
        // ignored — leave previous value (or null on first load).
      }
    }

    fetchCount();
    const id = window.setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Link
      href={`/${locale}/dashboard/notifications`}
      aria-label="Notifications"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Bell className="h-4 w-4" />
      {count !== null && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
