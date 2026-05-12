import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { chatSchemas } from "@inmolink/shared";
import { Inbox } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ChatListPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const list = await apiFetch<chatSchemas.ChatThreadListResponse>("/api/dashboard/chat/threads");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Chat"
        description="Live conversations tied to viewing requests or direct messages."
      />

      <SurfaceCard flush>
        {list.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No conversations yet"
            description="Accept a viewing request or message a colleague to start one."
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.items.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/${locale}/dashboard/chat/${thread.id}`}
                  className="flex items-start justify-between gap-3 px-5 py-4 transition hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {thread.counterparty.firstName} {thread.counterparty.lastName}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {thread.kind}
                      </span>
                    </div>
                    {thread.lastMessagePreview && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {thread.lastMessagePreview}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {thread.lastMessageAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(thread.lastMessageAt).toLocaleString(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    {thread.unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </div>
  );
}
