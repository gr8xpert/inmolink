import { apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { viewingRequestSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; role?: string; cursor?: string }>;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-rose-100 text-rose-800",
  RESCHEDULED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-zinc-100 text-zinc-700",
  COMPLETED: "bg-violet-100 text-violet-800",
  EXPIRED: "bg-zinc-100 text-zinc-500",
};

export default async function ViewingsListPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "viewings" });

  const qs = new URLSearchParams();
  if (search.status) qs.set("status", search.status);
  if (search.role) qs.set("role", search.role);
  if (search.cursor) qs.set("cursor", search.cursor);
  const list = await apiFetch<viewingRequestSchemas.ViewingRequestListResponse>(
    `/api/dashboard/viewings?${qs.toString()}`,
  );

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← {t("back")}
        </Link>
      </header>

      <nav className="flex gap-2 text-sm">
        {(["all", "owner", "introducer"] as const).map((r) => {
          const params = new URLSearchParams();
          if (r !== "all") params.set("role", r);
          const active = (search.role ?? "all") === r;
          return (
            <Link
              key={r}
              href={`/${locale}/dashboard/viewings?${params.toString()}`}
              className={`rounded-md border px-3 py-1.5 ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              {t(`role.${r}`)}
            </Link>
          );
        })}
      </nav>

      {list.items.length === 0 ? (
        <p className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background shadow-sm">
          {list.items.map((v) => {
            const counterparty =
              session.user?.id === v.owner.id
                ? `${v.introducer.firstName} ${v.introducer.lastName}`
                : `${v.owner.firstName} ${v.owner.lastName}`;
            return (
              <li key={v.id}>
                <Link
                  href={`/${locale}/dashboard/viewings/${v.id}`}
                  className="block p-4 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{v.property.title ?? v.property.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("with", { name: counterparty })} · {t("client", { name: v.client.name })}
                      </p>
                      {v.scheduledAt && (
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">{t("scheduled")}:</span>{" "}
                          {formatDate(v.scheduledAt)}
                          {v.meetingPoint ? ` · ${v.meetingPoint}` : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v.status] ?? "bg-zinc-100"}`}
                    >
                      {t(`status.${v.status}`)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {list.nextCursor && (
        <Link
          href={`/${locale}/dashboard/viewings?${new URLSearchParams({ ...search, cursor: list.nextCursor }).toString()}`}
          className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("next")}
        </Link>
      )}
    </main>
  );
}
