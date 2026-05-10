import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { viewingRequestSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ViewingActions } from "./viewing-actions";

type Props = { params: Promise<{ locale: string; id: string }> };

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-rose-100 text-rose-800",
  RESCHEDULED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-zinc-100 text-zinc-700",
  COMPLETED: "bg-violet-100 text-violet-800",
  EXPIRED: "bg-zinc-100 text-zinc-500",
};

export default async function ViewingDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "viewings" });

  const v = await apiFetch<viewingRequestSchemas.ViewingRequest>(
    `/api/dashboard/viewings/${encodeURIComponent(id)}`,
  );

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";

  const isOwner = session.user?.id === v.owner.id;
  const counterparty = isOwner ? v.introducer : v.owner;

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("title")} · {v.id.slice(0, 8)}
          </p>
          <h1 className="text-2xl font-bold">{v.property.title ?? v.property.id}</h1>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v.status] ?? "bg-zinc-100"}`}
          >
            {t(`status.${v.status}`)}
          </span>
        </div>
        <Link
          href={`/${locale}/dashboard/viewings`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← {t("back")}
        </Link>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("detail.parties")}</h2>
          <p>
            <span className="text-muted-foreground">{t("detail.owner")}: </span>
            <Link href={`/${locale}/agent/${v.owner.slug}`} className="hover:underline">
              {v.owner.firstName} {v.owner.lastName}
            </Link>
          </p>
          <p>
            <span className="text-muted-foreground">{t("detail.introducer")}: </span>
            <Link href={`/${locale}/agent/${v.introducer.slug}`} className="hover:underline">
              {v.introducer.firstName} {v.introducer.lastName}
            </Link>
          </p>
        </div>

        <div className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("detail.client")}</h2>
          <p className="text-xs text-muted-foreground">{t("detail.encryptedNote")}</p>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 text-muted-foreground">{t("detail.name")}</dt>
              <dd className="font-medium">{v.client.name}</dd>
            </div>
            {v.client.email && (
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">{t("detail.email")}</dt>
                <dd>
                  <a href={`mailto:${v.client.email}`} className="hover:underline">
                    {v.client.email}
                  </a>
                </dd>
              </div>
            )}
            {v.client.phone && (
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">{t("detail.phone")}</dt>
                <dd>
                  <a
                    href={`https://wa.me/${v.client.phone.replace(/\D+/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {v.client.phone}
                  </a>{" "}
                  <span className="text-xs text-muted-foreground">{t("detail.whatsappHint")}</span>
                </dd>
              </div>
            )}
            {v.client.notes && (
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">{t("detail.notes")}</dt>
                <dd>{v.client.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <section className="space-y-3 rounded-md border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("detail.schedule")}</h2>
        <dl className="space-y-1 text-sm">
          {v.scheduledAt ? (
            <div className="flex gap-2">
              <dt className="w-32 text-muted-foreground">{t("scheduled")}</dt>
              <dd className="font-medium">
                {formatDate(v.scheduledAt)}
                {v.durationMinutes ? ` · ${v.durationMinutes}min` : ""}
                {v.meetingPoint ? ` · ${v.meetingPoint}` : ""}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-muted-foreground">{t("detail.preferredDates")}</dt>
              <dd>
                <ul className="mt-1 list-disc pl-5">
                  {v.preferredDates.map((d) => (
                    <li key={d}>{formatDate(d)}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-32 text-muted-foreground">{t("detail.expires")}</dt>
            <dd>{formatDate(v.expiresAt)}</dd>
          </div>
          {v.outcome && (
            <div className="flex gap-2">
              <dt className="w-32 text-muted-foreground">{t("detail.outcome")}</dt>
              <dd>{t(`outcome.${v.outcome}`)}</dd>
            </div>
          )}
        </dl>
      </section>

      <ViewingActions locale={locale} viewing={v} isOwner={isOwner} />

      {v.chatThreadId && (
        <Link
          href={`/${locale}/dashboard/chat/${v.chatThreadId}`}
          className="inline-block rounded-md border bg-background px-4 py-2 text-sm hover:bg-muted"
        >
          {t("detail.openChat", { name: `${counterparty.firstName} ${counterparty.lastName}` })}
        </Link>
      )}
    </main>
  );
}
