import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { chatSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChatPanel } from "./chat-panel";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ChatThreadPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const [thread, history] = await Promise.all([
    apiFetch<chatSchemas.ChatThread>(`/api/dashboard/chat/threads/${encodeURIComponent(id)}`),
    apiFetch<chatSchemas.ChatMessageListResponse>(
      `/api/dashboard/chat/threads/${encodeURIComponent(id)}/messages?limit=50`,
    ),
  ]);

  return (
    <main className="container mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <header className="flex items-center justify-between border-b pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {thread.kind === "VIEWING" ? "Viewing chat" : "Direct chat"}
          </p>
          <h1 className="text-xl font-bold">
            {thread.counterparty.firstName} {thread.counterparty.lastName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/agent/${thread.counterparty.slug}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            View profile
          </Link>
          <Link
            href={`/${locale}/dashboard/chat`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            ←
          </Link>
        </div>
      </header>

      <ChatPanel
        threadId={thread.id}
        currentUserId={session.user.id ?? ""}
        counterparty={thread.counterparty}
        initialMessages={history.items}
      />
    </main>
  );
}
