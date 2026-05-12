import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { chatSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={`${thread.counterparty.firstName} ${thread.counterparty.lastName}`}
        description={thread.kind === "VIEWING" ? "Viewing chat" : "Direct chat"}
        actions={
          <LinkButton
            href={`/${locale}/agent/${thread.counterparty.slug}`}
            variant="secondary"
            size="sm"
          >
            View profile
          </LinkButton>
        }
      />

      <SurfaceCard>
        <ChatPanel
          threadId={thread.id}
          currentUserId={session.user.id ?? ""}
          counterparty={thread.counterparty}
          initialMessages={history.items}
        />
      </SurfaceCard>
    </div>
  );
}
