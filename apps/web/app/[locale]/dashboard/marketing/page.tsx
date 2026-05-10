import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function MarketingLanding({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            PRO-only. Email templates, campaigns, contacts, suppressions, and email-domain
            authentication.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Dashboard
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/${locale}/dashboard/marketing/templates`}
          className="rounded-md border bg-background p-4 shadow-sm hover:bg-muted/30"
        >
          <h2 className="font-semibold">Templates</h2>
          <p className="text-sm text-muted-foreground">
            Reusable subject + HTML body with merge tags. Preview against sample data.
          </p>
        </Link>
        <Link
          href={`/${locale}/dashboard/marketing/campaigns`}
          className="rounded-md border bg-background p-4 shadow-sm hover:bg-muted/30"
        >
          <h2 className="font-semibold">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Send a campaign now or schedule. Per-recipient open / click / bounce tracking.
          </p>
        </Link>
        <Link
          href={`/${locale}/dashboard/marketing/contacts`}
          className="rounded-md border bg-background p-4 shadow-sm hover:bg-muted/30"
        >
          <h2 className="font-semibold">Contacts</h2>
          <p className="text-sm text-muted-foreground">
            Recipient pool. Tag for filtering inside campaigns.
          </p>
        </Link>
        <Link
          href={`/${locale}/dashboard/marketing/suppressions`}
          className="rounded-md border bg-background p-4 shadow-sm hover:bg-muted/30"
        >
          <h2 className="font-semibold">Suppressions</h2>
          <p className="text-sm text-muted-foreground">
            Hard blocks (bounces / unsubscribes / manual). Never sent to.
          </p>
        </Link>
        <Link
          href={`/${locale}/dashboard/agency/email-config`}
          className="rounded-md border bg-background p-4 shadow-sm hover:bg-muted/30"
        >
          <h2 className="font-semibold">SMTP &amp; DKIM</h2>
          <p className="text-sm text-muted-foreground">
            Per-agency SMTP credentials, custom-domain authentication.
          </p>
        </Link>
      </section>
    </main>
  );
}
