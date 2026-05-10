import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { chatSchemas } from "@inmolink/shared";
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
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Chat</h1>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Dashboard
        </Link>
      </header>

      {list.items.length === 0 ? (
        <p className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          No conversations yet — accept a viewing request or start a direct message.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background shadow-sm">
          {list.items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/${locale}/dashboard/chat/${t.id}`}
                className="flex items-start justify-between gap-3 p-4 hover:bg-muted/40"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {t.counterparty.firstName} {t.counterparty.lastName}{" "}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {t.kind}
                    </span>
                  </p>
                  {t.lastMessagePreview && (
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {t.lastMessagePreview}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {t.lastMessageAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.lastMessageAt).toLocaleString(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                  {t.unreadCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
