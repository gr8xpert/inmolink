import { ApiError, publicApiFetch } from "@/lib/api";
import { localeAlternates } from "@/lib/seo";
import type { publicLocationSchemas } from "@inmolink/shared";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";

/**
 * LocationGroup landing — `/[locale]/region/<group-slug>`. PLAN §10
 * (LocationGroup is a curated set of Locations, e.g. "Costa del Sol" =
 * [Marbella, Estepona, Mijas, Fuengirola]).
 *
 * Renders members + a roll-up property count. Clicking a member navigates
 * to its `/buy/...` landing.
 */

export const revalidate = 600;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

type Landing = publicLocationSchemas.PublicLocationGroupLanding;

const BASE_URL = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3002";

async function loadGroup(locale: string, slug: string): Promise<Landing | null> {
  try {
    return await publicApiFetch<Landing>(
      `/api/public/location-groups/landing?slug=${encodeURIComponent(slug)}&locale=${locale}`,
      { revalidate: 600, tags: [`location-group-landing:${locale}:${slug}`] },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const group = await loadGroup(locale, slug);
  if (!group) return {};

  // Same caveat as /buy: alternate hreflang paths assume the slug is the
  // same across locales. The api returns the slug for the current locale
  // only; a future refactor can carry alternateSlugs the same way the
  // property detail does.
  const alternates = localeAlternates({
    currentLocale: locale,
    path: `/region/${group.slug}`,
  });
  const canonical =
    typeof alternates.canonical === "string"
      ? alternates.canonical
      : `${BASE_URL}/${locale}/region/${group.slug}`;
  return {
    title: group.metaTitle ?? group.name,
    description: group.metaDescription ?? undefined,
    alternates,
    openGraph: {
      type: "website",
      locale,
      url: canonical,
      title: group.metaTitle ?? group.name,
      description: group.metaDescription ?? undefined,
      siteName: "Inmolink",
    },
  };
}

export default async function LocationGroupLandingPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const group = await loadGroup(locale, slug);
  if (!group) permanentRedirect(`/${locale}`);

  const canonicalUrl = `${BASE_URL}/${locale}/region/${group.slug}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: group.name, item: canonicalUrl },
    ],
  };

  return (
    <main className="container mx-auto max-w-5xl space-y-8 p-6">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={`/${locale}`} className="hover:underline">
              Home
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <span aria-current="page" className="font-medium text-foreground">
              {group.name}
            </span>
          </li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
        <p className="text-muted-foreground">
          {group.totalProperties.toLocaleString(locale)} properties across {group.members.length}{" "}
          location{group.members.length === 1 ? "" : "s"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Locations in this region</h2>
        <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {group.members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/${locale}${m.path}`}
                className="block rounded-md border p-3 hover:bg-muted/50"
              >
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.propertyCount} listings
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
