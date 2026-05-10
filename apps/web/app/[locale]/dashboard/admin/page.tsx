import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
  // Match the api's requireSuperAdmin gate. Defence-in-depth — the api
  // also enforces, but rendering an empty admin shell for non-super-admins
  // is just noise.
  if (session.user.role !== "SUPER_ADMIN") {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Super-admin curation surface. Sprint 2 — taxonomy management.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/${locale}/dashboard/admin/property-types`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Property types</h2>
          <p className="text-sm text-muted-foreground">
            Curate the PropertyTypeGroup + PropertyType taxonomy. Translations, icon, AI suggester.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/admin/features`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Features</h2>
          <p className="text-sm text-muted-foreground">
            Curate the amenity catalog (pool, parking, sea view, …). Translations + Lucide icons +
            AI suggester.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/admin/locations`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Locations</h2>
          <p className="text-sm text-muted-foreground">
            4-level tree (Country → Region → City → Area). Translations + lat/long + SEO meta.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/admin/location-groups`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Location groups</h2>
          <p className="text-sm text-muted-foreground">
            Editorial bundles like &ldquo;Costa del Sol&rdquo;. Translations + member picker +
            per-member reorder.
          </p>
        </Link>
      </section>

      <section className="space-y-3 rounded-md border bg-muted/30 p-4">
        <div>
          <h2 className="font-semibold">Sitemap</h2>
          <p className="text-sm text-muted-foreground">
            The worker regenerates daily at 02:00 UTC. Trigger manually if a publishing burst needs
            to land in search results faster.
          </p>
        </div>
        <SitemapRegenerateButton locale={locale} />
      </section>
    </main>
  );
}
