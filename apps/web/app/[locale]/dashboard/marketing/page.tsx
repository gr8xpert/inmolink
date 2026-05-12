import { HubTile } from "@/components/dashboard/hub-tile";
import { PageHeader } from "@/components/dashboard/page-header";
import { auth } from "@inmolink/auth";
import { FileText, Mail, Send, ShieldOff, Users } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function MarketingLanding({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Marketing"
        description="PRO-only. Email templates, campaigns, contacts, suppressions, and email-domain authentication."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HubTile
          href={`/${locale}/dashboard/marketing/templates`}
          title="Templates"
          description="Reusable subject + HTML body with merge tags. Preview against sample data."
          icon={FileText}
        />
        <HubTile
          href={`/${locale}/dashboard/marketing/campaigns`}
          title="Campaigns"
          description="Send now or schedule. Per-recipient open / click / bounce tracking."
          icon={Send}
        />
        <HubTile
          href={`/${locale}/dashboard/marketing/contacts`}
          title="Contacts"
          description="Recipient pool. Tag for filtering inside campaigns."
          icon={Users}
        />
        <HubTile
          href={`/${locale}/dashboard/marketing/suppressions`}
          title="Suppressions"
          description="Hard blocks (bounces, unsubscribes, manual). Never sent to."
          icon={ShieldOff}
        />
        <HubTile
          href={`/${locale}/dashboard/agency/email-config`}
          title="SMTP & DKIM"
          description="Per-agency SMTP credentials, custom-domain authentication."
          icon={Mail}
        />
      </div>
    </div>
  );
}
