import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelCampaignAction, deleteCampaignAction, sendNowAction } from "./actions";
import { CampaignForm } from "./campaign-form";

type Props = { params: Promise<{ locale: string }> };

const STATUS_BADGE: Record<marketingSchemas.CampaignStatus, string> = {
  DRAFT: "bg-muted",
  SCHEDULED: "bg-blue-100 text-blue-900",
  SENDING: "bg-amber-100 text-amber-900",
  SENT: "bg-emerald-100 text-emerald-900",
  PAUSED: "bg-muted",
  CANCELLED: "bg-muted",
  FAILED: "bg-red-100 text-red-900",
};

export default async function CampaignsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let data: { items: marketingSchemas.Campaign[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch("/api/dashboard/marketing/campaigns?limit=25");
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Send a campaign now, or schedule it. Per-recipient open / click / bounce / unsubscribe
            tracking.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/marketing`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Marketing
        </Link>
      </header>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">New campaign</h2>
        <CampaignForm locale={locale} />
      </section>

      <section className="space-y-2">
        {data.items.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-2 rounded-md border bg-background p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.subject}</p>
              <p className="mt-1 text-xs">
                <span
                  className={`rounded px-2 py-0.5 font-semibold uppercase ${STATUS_BADGE[c.status]}`}
                >
                  {c.status}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {c.recipientCount} recipients · sent {c.sentCount} · opened {c.openedCount} ·
                  clicked {c.clickedCount} · bounced {c.bouncedCount} · unsubscribed{" "}
                  {c.unsubscribedCount}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              {(c.status === "DRAFT" || c.status === "SCHEDULED" || c.status === "PAUSED") && (
                <form action={sendNowAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90"
                  >
                    Send now
                  </button>
                </form>
              )}
              {(c.status === "DRAFT" ||
                c.status === "SCHEDULED" ||
                c.status === "SENDING" ||
                c.status === "PAUSED") && (
                <form action={cancelCampaignAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Cancel
                  </button>
                </form>
              )}
              {c.status !== "SENDING" && (
                <form action={deleteCampaignAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {data.items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        )}
      </section>
    </main>
  );
}
