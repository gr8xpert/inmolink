import { ApiError, publicApiFetch } from "@/lib/api";
import { localeAlternates } from "@/lib/seo";
import type { publicLocationSchemas } from "@inmolink/shared";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";

/**
 * Location landing page (PLAN §11.13). 4-level hierarchy:
 *   /[locale]/buy                        → bare → 301 to /[locale] (no-op landing)
 *   /[locale]/buy/spain                  → COUNTRY
 *   /[locale]/buy/spain/malaga           → REGION
 *   /[locale]/buy/spain/malaga/marbella  → CITY
 *   /[locale]/buy/spain/.../elviria      → AREA
 *
 * The `[[...path]]` optional catch-all means a missing or empty segment is
 * legal at the route level — we redirect to home rather than 404 (PLAN
 * "never 404 deleted public pages").
 *
 * ISR: 10 minutes. Less hot than property detail (which gets refreshed
 * on every property edit), more hot than the sitemap (which the worker
 * regenerates daily).
 */

export const revalidate = 600;

type Props = {
  params: Promise<{ locale: string; path?: string[] }>;
};

type Landing = publicLocationSchemas.PublicLocationLanding;

const BASE_URL = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3002";

async function loadLanding(locale: string, path: string): Promise<Landing | null> {
  try {
    return await publicApiFetch<Landing>(
      `/api/public/locations/landing?path=${encodeURIComponent(path)}&locale=${locale}`,
      { revalidate: 600, tags: [`location-landing:${locale}:${path}`] },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, path = [] } = await params;
  if (path.length === 0) return {};
  const landing = await loadLanding(locale, path.join("/"));
  if (!landing) return {};

  // hreflang alternates: same path used for every locale. This is correct
  // when slugs match across locales (e.g. /buy/spain). It's *imperfect*
  // when slugs translate (/buy/españa for the es locale) — the api would
  // need to return per-locale paths to get those right. Tracking as a
  // Sprint 4 polish; Google still gets the canonical right.
  const alternates = localeAlternates({ currentLocale: locale, path: landing.path });
  const canonical =
    typeof alternates.canonical === "string"
      ? alternates.canonical
      : `${BASE_URL}/${locale}${landing.path}`;
  return {
    title: landing.metaTitle ?? landing.name,
    description: landing.metaDescription ?? undefined,
    alternates,
    openGraph: {
      type: "website",
      locale,
      url: canonical,
      title: landing.metaTitle ?? landing.name,
      description: landing.metaDescription ?? undefined,
      siteName: "Inmolink",
    },
  };
}

export default async function BuyLandingPage({ params }: Props) {
  const { locale, path = [] } = await params;
  setRequestLocale(locale);

  // Empty path → home (don't 404 the bare /buy URL).
  if (path.length === 0) permanentRedirect(`/${locale}`);

  const landing = await loadLanding(locale, path.join("/"));
  // Per PLAN: deleted/missing public landing pages 301 home, not 404.
  if (!landing) permanentRedirect(`/${locale}`);

  const canonicalUrl = `${BASE_URL}/${locale}${landing.path}`;

  // BreadcrumbList JSON-LD — Google uses this in SERP cards.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: landing.breadcrumb.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      item: `${BASE_URL}/${locale}${b.path}`,
    })),
  };

  // Place JSON-LD with optional geo. Spec says `containedInPlace` for the
  // parent — we model the immediate ancestor only to keep payload small.
  const parent = landing.breadcrumb[landing.breadcrumb.length - 2];
  const placeLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: landing.name,
    url: canonicalUrl,
    address: {
      "@type": "PostalAddress",
      addressCountry: landing.countryCode,
    },
    ...(landing.latitude !== null && landing.longitude !== null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: landing.latitude,
            longitude: landing.longitude,
          },
        }
      : {}),
    ...(parent
      ? {
          containedInPlace: {
            "@type": "Place",
            name: parent.name,
            url: `${BASE_URL}/${locale}${parent.path}`,
          },
        }
      : {}),
  };

  // FAQPage JSON-LD — only emitted when curated FAQs exist.
  const faqLd =
    landing.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: landing.faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: f.answer,
            },
          })),
        }
      : null;

  return (
    <main className="container mx-auto max-w-5xl space-y-8 p-6">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built JSON-LD
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      {/* Breadcrumb (rendered) */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={`/${locale}`} className="hover:underline">
              Home
            </Link>
          </li>
          {landing.breadcrumb.map((b, idx) => (
            <li key={b.path} className="flex items-center gap-1">
              <span aria-hidden>/</span>
              {idx === landing.breadcrumb.length - 1 ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {b.name}
                </span>
              ) : (
                <Link href={`/${locale}${b.path}`} className="hover:underline">
                  {b.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{landing.name}</h1>
        <p className="text-muted-foreground">
          {landing.totalProperties.toLocaleString(locale)} properties for sale or rent
        </p>
        <Link
          href={`/${locale}/search?locationId=${encodeURIComponent(landing.id)}`}
          className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Browse all listings
        </Link>
      </header>

      {landing.children.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Browse by area</h2>
          <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {landing.children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${locale}${c.path}`}
                  className="block rounded-md border p-3 hover:bg-muted/50"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.propertyCount} listings
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {landing.faqs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Frequently asked questions</h2>
          <ul className="space-y-2">
            {landing.faqs.map((f) => (
              <li key={`${f.question}`} className="rounded-md border bg-background p-4">
                <h3 className="font-medium">{f.question}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{f.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
