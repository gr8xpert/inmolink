import { ApiError, publicApiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { type SeoLocale, localeAlternatesByLocale } from "@/lib/seo";
import type { publicPropertySchemas } from "@inmolink/shared";
import { AgencyBadge } from "@inmolink/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "next/navigation";
import { ContactAgencyForm } from "./contact-form";

/**
 * Public property detail page. PLAN §11.4 ISR (5 min stale-while-revalidate).
 *
 * URL shape: `/[locale]/property/[slugId]` where slugId is `<slug>-<id>`.
 * If the slug part doesn't match the canonical translation slug, we 301
 * to the canonical URL. If the property is missing / not PUBLIC / not
 * ACTIVE, we 301 to the home page (PLAN: never 404 deleted public pages
 * — SEO penalty otherwise).
 *
 * The detail page is read-only. Lead capture / contact-agency forms land
 * in Sprint 3 alongside the search infrastructure.
 */

// 5-minute Next.js revalidation per PLAN §11.4.
export const revalidate = 300;

const ID_PATTERN = /^([a-z0-9]{20,30})$/;
const SLUG_AND_ID = /^(.+?)-([a-z0-9]{20,30})$/;

type Props = {
  params: Promise<{ locale: string; slugId: string }>;
};

type Detail = publicPropertySchemas.PublicPropertyDetail;
type Images = { images: publicPropertySchemas.PublicPropertyImage[] };

function parseSlugId(slugId: string): { id: string; slugFromUrl: string | null } | null {
  if (ID_PATTERN.test(slugId)) return { id: slugId, slugFromUrl: null };
  const m = slugId.match(SLUG_AND_ID);
  if (!m) return null;
  return { id: m[2] as string, slugFromUrl: (m[1] as string) ?? null };
}

async function loadProperty(
  locale: string,
  id: string,
): Promise<{ detail: Detail; images: Images } | null> {
  try {
    const [detail, images] = await Promise.all([
      publicApiFetch<Detail>(`/api/public/properties/${encodeURIComponent(id)}?locale=${locale}`, {
        revalidate: 300,
      }),
      publicApiFetch<Images>(`/api/public/properties/${encodeURIComponent(id)}/images`, {
        revalidate: 300,
      }),
    ]);
    return { detail, images };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slugId } = await params;
  const parsed = parseSlugId(slugId);
  if (!parsed) return {};
  const loaded = await loadProperty(locale, parsed.id);
  if (!loaded) return {};

  const { detail, images } = loaded;
  const cover = images.images.find((i) => i.isCover) ?? images.images[0] ?? null;
  const description =
    detail.translation.metaDescription ?? detail.translation.description.slice(0, 160);
  const baseUrl = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3002";

  // hreflang alternates — one per locale that has a real translation.
  const pathByLocale: Partial<Record<SeoLocale, string>> = {};
  for (const [loc, slug] of Object.entries(detail.alternateSlugs)) {
    if (loc === "en" || loc === "es" || loc === "de" || loc === "fr") {
      pathByLocale[loc] = `/property/${slug}-${detail.id}`;
    }
  }
  const alternates = localeAlternatesByLocale({ currentLocale: locale, pathByLocale });
  const canonical =
    typeof alternates.canonical === "string"
      ? alternates.canonical
      : `${baseUrl}/${locale}/property/${detail.translation.slug}-${detail.id}`;

  return {
    title: detail.translation.metaTitle ?? detail.translation.title,
    description,
    alternates,
    openGraph: {
      type: "website",
      locale,
      url: canonical,
      title: detail.translation.title,
      description,
      siteName: "Inmolink",
      images: cover
        ? [{ url: cover.publicUrl, alt: cover.altText ?? detail.translation.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: detail.translation.title,
      description,
      images: cover ? [cover.publicUrl] : [],
    },
  };
}

export default async function PublicPropertyDetailPage({ params }: Props) {
  const { locale, slugId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "lead" });

  const parsed = parseSlugId(slugId);
  if (!parsed) permanentRedirect(`/${locale}`);

  const loaded = await loadProperty(locale, parsed.id);
  // Per PLAN §1 row 9 / "Never": deleted/missing public pages 301 home,
  // never 404 — preserves SEO equity that Google has already crawled.
  if (!loaded) permanentRedirect(`/${locale}`);

  const { detail, images } = loaded;

  // Canonical slug check — redirect to the right URL if a stale link
  // landed here (e.g. slug edited after translation update).
  const canonicalSlugId = `${detail.translation.slug}-${detail.id}`;
  if (slugId !== canonicalSlugId) {
    permanentRedirect(`/${locale}/property/${canonicalSlugId}`);
  }

  const cover = images.images.find((i) => i.isCover) ?? images.images[0] ?? null;
  const gallery = images.images.filter((i) => i.id !== cover?.id);

  const baseUrl = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3002";
  const canonicalUrl = `${baseUrl}/${locale}/property/${canonicalSlugId}`;

  // RealEstateListing JSON-LD per schema.org. Crawlers like Google use
  // this to enrich SERP cards. Note: priceCents → priceCents/100 for
  // human-readable currency value.
  const ld = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: detail.translation.title,
    description: detail.translation.description,
    url: canonicalUrl,
    datePosted: detail.publishedAt,
    image: [cover, ...gallery]
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => i.publicUrl),
    offers: {
      "@type": "Offer",
      price: detail.priceCents / 100,
      priceCurrency: detail.currency,
      availability: "https://schema.org/InStock",
      seller: { "@type": "RealEstateAgent", name: detail.agency.name },
    },
    ...(detail.bedrooms !== null ? { numberOfRooms: detail.bedrooms } : {}),
    ...(detail.areaM2 !== null
      ? { floorSize: { "@type": "QuantitativeValue", value: detail.areaM2, unitCode: "MTK" } }
      : {}),
  };

  return (
    <main className="container mx-auto max-w-5xl space-y-8 p-6">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <header className="space-y-2">
        <AgencyBadge name={detail.agency.name} logoUrl={detail.agency.logoUrl} size="md" />
        <h1 className="text-3xl font-bold tracking-tight">{detail.translation.title}</h1>
        <p className="text-2xl font-semibold">
          {formatMoney(detail.priceCents, detail.currency, locale)}
          {detail.priceType === "from" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">from</span>
          )}
          {detail.priceType === "poa" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">POA</span>
          )}
        </p>
      </header>

      {cover && (
        <section className="overflow-hidden rounded-lg">
          <img
            src={cover.publicUrl}
            alt={cover.altText ?? detail.translation.title}
            className="block h-auto w-full object-cover"
            // First-paint hero — let the browser prioritise it.
            // biome-ignore lint/a11y/useAltText: alt is provided above
            // @ts-expect-error fetchpriority is valid HTML, types missing
            fetchpriority="high"
          />
        </section>
      )}

      <section className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-3">
        <KeyFact label="Type" value={detail.transactionType.replace("_", " ")} />
        {detail.bedrooms !== null && <KeyFact label="Bedrooms" value={String(detail.bedrooms)} />}
        {detail.bathrooms !== null && (
          <KeyFact label="Bathrooms" value={String(detail.bathrooms)} />
        )}
        {detail.areaM2 !== null && <KeyFact label="Built area" value={`${detail.areaM2} m²`} />}
        {detail.plotM2 !== null && <KeyFact label="Plot" value={`${detail.plotM2} m²`} />}
        {detail.yearBuilt !== null && (
          <KeyFact label="Year built" value={String(detail.yearBuilt)} />
        )}
        {detail.publishedAt && (
          <KeyFact label="Listed" value={formatDate(detail.publishedAt, locale)} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">About this property</h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {detail.translation.description}
        </p>
      </section>

      {gallery.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Gallery</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {gallery.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-md border">
                <img
                  src={img.publicUrl}
                  alt={img.altText ?? ""}
                  loading="lazy"
                  className="block aspect-square w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ContactAgencyForm
        propertyId={detail.id}
        locale={locale}
        labels={{
          contactAgency: t("contactAgency"),
          name: t("name"),
          email: t("email"),
          phone: t("phone"),
          eitherEmailOrPhone: t("eitherEmailOrPhone"),
          message: t("message"),
          submit: t("submit"),
          submitting: t("submitting"),
          success: t("success"),
          error: t("error"),
        }}
      />
    </main>
  );
}

function KeyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
