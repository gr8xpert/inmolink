import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { notificationSchemas } from "@inmolink/shared";
import { cn } from "@inmolink/ui";
import { Bell } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarkAllReadButton } from "./mark-all-read";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unreadOnly?: string; cursor?: string }>;
};

const KIND_TO_LINK = (n: { kind: string; targetKind: string | null; targetId: string | null }) => {
  if (n.targetId && n.targetKind === "ViewingRequest") return `/dashboard/viewings/${n.targetId}`;
  if (n.targetId && n.targetKind === "Deal") return `/dashboard/deals/${n.targetId}`;
  if (n.targetId && n.targetKind === "ChatThread") return `/dashboard/chat/${n.targetId}`;
  return null;
};

export default async function NotificationsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const qs = new URLSearchParams();
  if (sp.unreadOnly === "true") qs.set("unreadOnly", "true");
  if (sp.cursor) qs.set("cursor", sp.cursor);
  const list = await apiFetch<notificationSchemas.NotificationListResponse>(
    `/api/dashboard/notifications?${qs.toString()}`,
  );

  const unreadOnly = sp.unreadOnly === "true";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Notifications"
        description={`${list.unreadCount} unread · activity from your viewings, deals, and chats.`}
        actions={<MarkAllReadButton locale={locale} />}
      />

      <nav className="mb-6 flex gap-1.5 text-sm">
        <Link
          href={`/${locale}/dashboard/notifications`}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition",
            !unreadOnly
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          All
        </Link>
        <Link
          href={`/${locale}/dashboard/notifications?unreadOnly=true`}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition",
            unreadOnly
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Unread only
        </Link>
      </nav>

      <SurfaceCard flush>
        {list.items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
        ) : (
          <ul className="divide-y divide-border">
            {list.items.map((n) => {
              const href = KIND_TO_LINK(n);
              const body = (
                <div className="flex items-start gap-3 px-5 py-4">
                  <span
                    className={cn(
                      "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <p className="font-medium capitalize text-foreground">
                      {n.kind.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString(locale)}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className={cn(!n.readAt && "bg-primary-soft/40")}>
                  {href ? (
                    <Link href={`/${locale}${href}`} className="block transition hover:bg-muted/40">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SurfaceCard>

      {list.nextCursor && (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/${locale}/dashboard/notifications?${new URLSearchParams({ ...sp, cursor: list.nextCursor }).toString()}`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-muted"
          >
            Next page →
          </Link>
        </div>
      )}
    </div>
  );
}
