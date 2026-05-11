"use client";

import { env } from "@/env";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const API_BASE = env.NEXT_PUBLIC_API_URL;

export function MarkAllReadButton({ locale: _locale }: { locale: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await fetch(`${API_BASE}/api/dashboard/notifications/read-all`, {
            method: "POST",
            credentials: "include",
          });
          router.refresh();
        });
      }}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
    >
      {pending ? "…" : "Mark all read"}
    </button>
  );
}
