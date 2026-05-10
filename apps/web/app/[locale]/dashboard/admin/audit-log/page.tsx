import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { auditSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cursor?: string;
    type?: string;
    actorEmail?: string;
    agencyId?: string;
    targetKind?: string;
  }>;
};

const EVENT_TYPES = [
  "USER_LOGIN",
  "USER_LOGOUT",
  "PASSWORD_CHANGED",
  "TOTP_ENABLED",
  "TOTP_DISABLED",
  "ROLE_CHANGED",
  "PLAN_CHANGED",
  "PLAN_GRANTED_MANUALLY",
  "PLAN_REVOKED",
  "PROPERTY_DELETED",
  "PROPERTY_HARD_DELETED",
  "AGENCY_CREATED",
  "DEAL_DISPUTED",
  "DEAL_DISPUTE_RESOLVED",
  "IMPORT_CREDENTIALS_UPDATED",
  "WEBHOOK_REPLAYED",
  "SUPER_ADMIN_BULK_OPERATION",
];

export default async function AuditLogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { cursor, type, actorEmail, agencyId, targetKind } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (cursor) qs.set("cursor", cursor);
  if (type) qs.set("type", type);
  if (actorEmail) qs.set("actorEmail", actorEmail);
  if (agencyId) qs.set("agencyId", agencyId);
  if (targetKind) qs.set("targetKind", targetKind);

  let data: { items: auditSchemas.AuditLogRow[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let listError: string | null = null;
  try {
    data = await apiFetch(`/api/dashboard/admin/audit-log?${qs.toString()}`);
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Security-sensitive events. Filterable by type, actor, agency, target. Super-admin only.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <form className="grid gap-2 sm:grid-cols-5">
        <select name="type" defaultValue={type ?? ""} className="input">
          <option value="">All event types</option>
          {EVENT_TYPES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input
          name="actorEmail"
          defaultValue={actorEmail ?? ""}
          placeholder="actor email…"
          className="input"
        />
        <input
          name="agencyId"
          defaultValue={agencyId ?? ""}
          placeholder="agencyId"
          className="input"
        />
        <input
          name="targetKind"
          defaultValue={targetKind ?? ""}
          placeholder="targetKind"
          className="input"
        />
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Filter
        </button>
      </form>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="overflow-x-auto rounded-md border bg-background shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-xs">
                  {new Date(r.createdAt).toLocaleString(locale)}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                    {r.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.actorEmail ?? "—"}
                  {r.actorIp && <div className="text-muted-foreground">{r.actorIp}</div>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.targetKind && r.targetId ? `${r.targetKind}/${r.targetId.slice(0, 12)}…` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[10px]">
                  {r.metadata ? JSON.stringify(r.metadata).slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && !listError && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No events match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {data.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/dashboard/admin/audit-log`,
              query: {
                ...(type ? { type } : {}),
                ...(actorEmail ? { actorEmail } : {}),
                ...(agencyId ? { agencyId } : {}),
                ...(targetKind ? { targetKind } : {}),
                cursor: data.nextCursor,
              },
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next →
          </Link>
        </div>
      )}
    </main>
  );
}
