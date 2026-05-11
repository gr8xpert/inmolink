"use client";

import { env } from "@/env";
import type { chatSchemas } from "@inmolink/shared";
import { useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";

const API_BASE = env.NEXT_PUBLIC_API_URL;

type Props = {
  threadId: string;
  currentUserId: string;
  counterparty: chatSchemas.ChatThread["counterparty"];
  initialMessages: chatSchemas.ChatMessage[];
};

/**
 * Live chat panel.
 *
 * - Initial render uses the SSR-fetched message history (REST).
 * - Open Socket.io connection, join `thread:<id>`, subscribe to
 *   `chat:message:new` for real-time updates.
 * - POST new messages via REST (server fans out via socket); we don't echo
 *   to the local list ourselves to avoid double-render — the socket event
 *   for our own message arrives via the `thread:<id>` room.
 * - Mark-read on mount and on each incoming message while focused.
 */
export function ChatPanel({ threadId, currentUserId, counterparty, initialMessages }: Props) {
  // initialMessages are newest-first from the api; flip for chronological display
  const [messages, setMessages] = useState<chatSchemas.ChatMessage[]>(() =>
    [...initialMessages].reverse(),
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Connect once per threadId.
  useEffect(() => {
    const socket = io(API_BASE, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("chat:thread:join", { threadId });
    });
    socket.on("chat:message:new", (m: chatSchemas.ChatMessage) => {
      if (m.threadId !== threadId) return;
      setMessages((prev) => {
        if (prev.some((existing) => existing.id === m.id)) return prev;
        return [...prev, m];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [threadId]);

  // Mark read whenever new messages land. Effect re-runs only on count
  // change — exhaustive-deps would push for the full `messages` array which
  // would defeat the purpose (every same-content re-render would mark-read).
  // biome-ignore lint/correctness/useExhaustiveDependencies: count-only dep is intentional
  useEffect(() => {
    fetch(`${API_BASE}/api/dashboard/chat/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  }, [threadId, messages.length]);

  // Auto-scroll to bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only scroll when message count changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/dashboard/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: draft.trim() }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const m = (await res.json()) as chatSchemas.ChatMessage;
      // Optimistic insert in case the socket lags.
      setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-md border bg-background shadow-sm">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Start the conversation with {counterparty.firstName}.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderUserId === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  mine
                    ? "bg-foreground text-background"
                    : m.systemKind
                      ? "border border-dashed bg-muted"
                      : "bg-muted"
                }`}
              >
                {m.systemKind === "viewing_proposed" && (
                  <p className="mb-1 text-xs uppercase tracking-wide opacity-70">
                    Viewing proposed
                  </p>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-[10px] opacity-60">
                  {new Date(m.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="input flex-1"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
