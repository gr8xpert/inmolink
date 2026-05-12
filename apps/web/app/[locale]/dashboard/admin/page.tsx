import { HubTile } from "@/components/dashboard/hub-tile";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import {
  Activity,
  AlertTriangle,
  CreditCard,
  Inbox,
  LifeBuoy,
  Link2,
  MapPin,
  Sparkles,
  Star,
  Tag,
  Webhook,
} from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { SitemapRegenerateButton } from "./sitemap-button";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminLandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Admin console" description="Super-admin curation surface." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HubTile
          href={`/${locale}/dashboard/admin/property-types`}
          title="Property types"
          description="PropertyTypeGroup + PropertyType taxonomy. Translations + AI icon suggester."
          icon={Tag}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/features`}
          title="Features"
          description="Amenity catalog. Translations, Lucide icons, AI suggester."
          icon={Sparkles}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/locations`}
          title="Locations"
          description="Country → Region → City → Area tree. Translations + lat/long + SEO meta."
          icon={MapPin}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/location-groups`}
          title="Location groups"
          description="Editorial bundles. Translations + member picker + reorder."
          icon={MapPin}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/feed-type-maps`}
          title="Feed type mappings"
          description="Map raw connector labels to canonical property types."
          icon={Link2}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/disputes`}
          title="Disputes queue"
          description="Resolve deals where listing agent and introducer disagree."
          icon={AlertTriangle}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/billing`}
          title="Billing & grants"
          description="Browse subscriptions, grant or revoke plan tiers."
          icon={CreditCard}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/featured-listings`}
          title="Featured listings"
          description="Curate homepage / location / agency-profile slots. PRO-only eligible."
          icon={Star}
        />
        <HubTile
          href={`/${locale}/dashboard/tickets`}
          title="Tickets queue"
          description="Triage support tickets from agents."
          icon={LifeBuoy}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/audit-log`}
          title="Audit log"
          description="Security-sensitive events. Filterable by event, actor, agency, target."
          icon={Activity}
        />
        <HubTile
          href={`/${locale}/dashboard/admin/webhook-deliveries`}
          title="Webhook deliveries"
          description="Every outbound delivery across agencies. Filter, replay."
          icon={Webhook}
        />
        <HubTile
          href={`/${locale}/dashboard/notifications`}
          title="Notifications"
          description="Activity feed across your account."
          icon={Inbox}
        />
      </div>

      <SurfaceCard
        title="Sitemap"
        description="Worker regenerates daily at 02:00 UTC. Trigger manually to push a publishing burst into search results faster."
        className="mt-6"
      >
        <SitemapRegenerateButton locale={locale} />
      </SurfaceCard>
    </div>
  );
}
