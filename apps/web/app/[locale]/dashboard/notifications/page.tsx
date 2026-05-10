import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { notificationSchemas } from "@inmolink/shared";
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

  return (
    <main className="container mx-auto max-w-3xl space-y-4 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {list.unreadCount} unread · activity related to your viewings, deals, and chats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ← Dashboard
          </Link>
          <MarkAllReadButton locale={locale} />
        </div>
      </header>

      <nav className="flex gap-2 text-sm">
        <Link
          href={`/${locale}/dashboard/notifications`}
          className={`rounded-md border px-3 py-1.5 ${sp.unreadOnly === "true" ? "hover:bg-muted" : "bg-foreground text-background"}`}
        >
          All
        </Link>
        <Link
          href={`/${locale}/dashboard/notifications?unreadOnly=true`}
          className={`rounded-md border px-3 py-1.5 ${sp.unreadOnly === "true" ? "bg-foreground text-background" : "hover:bg-muted"}`}
        >
          Unread only
        </Link>
      </nav>

      {list.items.length === 0 ? (
        <p className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          No notifications.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background shadow-sm">
          {list.items.map((n) => {
            const href = KIND_TO_LINK(n);
            const body = (
              <div className="flex items-start gap-3 p-4">
                {!n.readAt && (
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{n.kind.replace(/_/g, " ").toLowerCase()}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString(locale)}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={n.id} className={n.readAt ? "" : "bg-emerald-50/30"}>
                {href ? (
                  <Link href={`/${locale}${href}`} className="block hover:bg-muted/40">
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

      {list.nextCursor && (
        <Link
          href={`/${locale}/dashboard/notifications?${new URLSearchParams({ ...sp, cursor: list.nextCursor }).toString()}`}
          className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Next page
        </Link>
      )}
    </main>
  );
}
