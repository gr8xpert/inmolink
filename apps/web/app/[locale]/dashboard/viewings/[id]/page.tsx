import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge, toneForStatus } from "@/components/dashboard/status-badge";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { viewingRequestSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ViewingActions } from "./viewing-actions";

type Props = { params: Promise<{ locale: string; id: string }> };

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
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={v.property.title ?? v.property.id}
        description={`${t("title")} · ${v.id.slice(0, 8)}`}
        actions={<StatusBadge label={t(`status.${v.status}`)} tone={toneForStatus(v.status)} />}
      />

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <SurfaceCard title={t("detail.parties")}>
            <div className="space-y-2 text-sm">
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
          </SurfaceCard>

          <SurfaceCard title={t("detail.client")} description={t("detail.encryptedNote")}>
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
                    <span className="text-xs text-muted-foreground">
                      {t("detail.whatsappHint")}
                    </span>
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
          </SurfaceCard>
        </div>

        <SurfaceCard title={t("detail.schedule")}>
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
        </SurfaceCard>

        <ViewingActions locale={locale} viewing={v} isOwner={isOwner} />

        {v.chatThreadId && (
          <div>
            <LinkButton href={`/${locale}/dashboard/chat/${v.chatThreadId}`} variant="secondary">
              {t("detail.openChat", { name: `${counterparty.firstName} ${counterparty.lastName}` })}
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
