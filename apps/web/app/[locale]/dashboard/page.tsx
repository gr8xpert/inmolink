import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import { CalendarCheck, Handshake, Home as HomeIcon, MessageSquare } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * Dashboard landing — stat row (Properties / Active / Pending viewings /
 * This-month deals) + Recent Properties table + Pipeline Status panel.
 *
 * Stats are scoped to the signed-in user's visibility: agents see their own
 * counts, agency admins see the whole agency, super-admins see global.
 */
export default async function DashboardHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  const user = session.user;
  const scope = buildScopeFilter(user);
  const monthStart = startOfMonth(new Date());

  const [
    totalProperties,
    activeProperties,
    pendingViewings,
    monthDeals,
    recentProperties,
    dealsByStatus,
  ] = await Promise.all([
    prisma.property.count({ where: { ...scope.property, deletedAt: null } }),
    prisma.property.count({
      where: { ...scope.property, deletedAt: null, status: "ACTIVE", visibility: "PUBLIC" },
    }),
    prisma.viewingRequest.count({
      where: { ...scope.viewing, status: "PENDING" },
    }),
    prisma.deal.count({
      where: { ...scope.deal, createdAt: { gte: monthStart }, status: "CONFIRMED" },
    }),
    prisma.property.findMany({
      where: { ...scope.property, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        visibility: true,
        priceCents: true,
        currency: true,
        createdAt: true,
        translations: { select: { locale: true, title: true } },
      },
    }),
    prisma.deal.groupBy({
      where: scope.deal,
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const dealStatusBreakdown = summarizeDealStatuses(dealsByStatus);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name.split(" ")[0]}. Here's how your pipeline is looking.`}
        actions={
          <Link
            href={`/${locale}/dashboard/properties/new`}
            className="inline-flex items-center gap-1.5 bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_6px_16px_rgba(37,99,235,0.25)] active:scale-[0.97]"
          >
            + New property
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stagger-1">
          <StatCard
            label="Total properties"
            value={totalProperties}
            hint={`${activeProperties} public + active`}
            icon={HomeIcon}
            tone="primary"
          />
        </div>
        <div className="stagger-2">
          <StatCard
            label="Active listings"
            value={activeProperties}
            hint="Public + accepting enquiries"
            icon={HomeIcon}
            tone="success"
          />
        </div>
        <div className="stagger-3">
          <StatCard
            label="Pending viewings"
            value={pendingViewings}
            hint="Awaiting your response"
            icon={CalendarCheck}
            tone="warning"
          />
        </div>
        <div className="stagger-4">
          <StatCard
            label="Deals this month"
            value={monthDeals}
            hint="Confirmed + commission earned"
            icon={Handshake}
            tone="info"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <SurfaceCard
          title="Recent properties"
          description="Your latest 5 listings"
          className="xl:col-span-2"
          actions={
            <Link
              href={`/${locale}/dashboard/properties`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          }
          flush
        >
          {recentProperties.length === 0 ? (
            <EmptyState
              icon={HomeIcon}
              title="No properties yet"
              description="Add your first listing to start receiving viewing requests."
              cta={{ label: "+ New property", href: `/${locale}/dashboard/properties/new` }}
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentProperties.map((p) => {
                const tr = p.translations.find((t) => t.locale === locale) ?? p.translations[0];
                return (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <Link
                      href={`/${locale}/dashboard/properties/${p.id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <div className="truncate font-medium text-foreground">
                        {tr?.title ?? "Untitled property"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatPrice(p.priceCents, p.currency)} · {timeAgo(p.createdAt)}
                      </div>
                    </Link>
                    <StatusBadge status={p.status} visibility={p.visibility} />
                  </li>
                );
              })}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard title="Deal pipeline" description="Distribution by status">
          {dealStatusBreakdown.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deals yet. Confirm your first one to start tracking commission.
            </p>
          ) : (
            <ul className="space-y-3">
              {dealStatusBreakdown.rows.map((row) => (
                <li key={row.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="text-muted-foreground">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${row.barClass}`}
                      style={{ width: `${(row.count / dealStatusBreakdown.total) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          locale={locale}
          href="/dashboard/viewings"
          title="Viewings"
          description="Pending + upcoming"
          icon={CalendarCheck}
        />
        <QuickLink
          locale={locale}
          href="/dashboard/chat"
          title="Chat"
          description="Conversations"
          icon={MessageSquare}
        />
        <QuickLink
          locale={locale}
          href="/dashboard/imports"
          title="Imports"
          description="Bulk listings"
          icon={HomeIcon}
        />
        <QuickLink
          locale={locale}
          href="/dashboard/marketing"
          title="Marketing"
          description="Campaigns + leads"
          icon={Handshake}
        />
      </div>
    </div>
  );
}

function QuickLink({
  locale,
  href,
  title,
  description,
  icon: Icon,
}: {
  locale: string;
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={`/${locale}${href}`}
      className="surface surface-interactive group flex items-center gap-3 p-3.5 animate-fade-in-up"
    >
      <div className="flex h-9 w-9 items-center justify-center bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, visibility }: { status: string; visibility: string }) {
  if (status !== "ACTIVE") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {status.toLowerCase()}
      </span>
    );
  }
  if (visibility === "PUBLIC") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
        Public
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
      {visibility.toLowerCase()}
    </span>
  );
}

type ScopeUser = {
  id: string;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "AGENT";
  agencyId: string | null;
};

/**
 * Build per-table Prisma `where` filters scoped to the user's visibility.
 * Mirrors the rules enforced by the api's `can()` helper.
 */
function buildScopeFilter(user: ScopeUser): {
  property: Record<string, unknown>;
  viewing: Record<string, unknown>;
  deal: Record<string, unknown>;
} {
  if (user.role === "SUPER_ADMIN") {
    return { property: {}, viewing: {}, deal: {} };
  }
  if (user.role === "AGENCY_ADMIN" && user.agencyId) {
    return {
      property: { ownerAgencyId: user.agencyId },
      viewing: { OR: [{ ownerUserId: user.id }, { introducerAgencyId: user.agencyId }] },
      deal: { OR: [{ ownerUserId: user.id }, { introducerUserId: user.id }] },
    };
  }
  return {
    property: { ownerUserId: user.id },
    viewing: { OR: [{ ownerUserId: user.id }, { introducerUserId: user.id }] },
    deal: { OR: [{ ownerUserId: user.id }, { introducerUserId: user.id }] },
  };
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatPrice(cents: bigint | number, currency: string): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString()} ${currency}`;
  }
}

function timeAgo(d: Date): string {
  const seconds = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type DealStatusRow = { status: string; _count: { _all: number } };

function summarizeDealStatuses(rows: DealStatusRow[]): {
  total: number;
  rows: Array<{ status: string; label: string; count: number; barClass: string }>;
} {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.status, r._count._all);
  }
  const definitions: Array<{ key: string; label: string; bar: string }> = [
    { key: "CONFIRMED", label: "Confirmed", bar: "bg-success" },
    { key: "PENDING_BOTH", label: "Pending — both", bar: "bg-warning" },
    { key: "PENDING_OWNER", label: "Pending — owner", bar: "bg-warning" },
    { key: "PENDING_INTRODUCER", label: "Pending — introducer", bar: "bg-warning" },
    { key: "DISPUTED", label: "Disputed", bar: "bg-danger" },
    { key: "CANCELLED", label: "Cancelled", bar: "bg-muted-foreground" },
  ];
  const out = definitions
    .map((d) => ({
      status: d.key,
      label: d.label,
      count: map.get(d.key) ?? 0,
      barClass: d.bar,
    }))
    .filter((r) => r.count > 0);
  const total = out.reduce((s, r) => s + r.count, 0);
  return { total, rows: out };
}
