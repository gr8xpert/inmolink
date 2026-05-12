import { Button, LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { auditSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Audit log"
        description="Security-sensitive events. Filterable by type, actor, agency, target. Super-admin only."
      />

      <div className="space-y-6">
        <SurfaceCard>
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
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>
        </SurfaceCard>

        {listError && (
          <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {listError}
          </div>
        )}

        <SurfaceCard flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-5 py-3 text-xs">
                      {new Date(r.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {r.actorEmail ?? "—"}
                      {r.actorIp && <div className="text-muted-foreground">{r.actorIp}</div>}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {r.targetKind && r.targetId
                        ? `${r.targetKind}/${r.targetId.slice(0, 12)}…`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-[10px]">
                      {r.metadata ? JSON.stringify(r.metadata).slice(0, 120) : "—"}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && !listError && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted-foreground">
                      No events match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        {data.nextCursor && (
          <div className="flex justify-end">
            <LinkButton
              variant="secondary"
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
            >
              Next →
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}
