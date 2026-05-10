import { ApiError, publicApiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { localeAlternates } from "@/lib/seo";
import type { publicProfileSchemas } from "@inmolink/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Public agency landing — PLAN §8.
 *
 * ISR 5min. Hard-filtered to `isPublic && isActive` agencies in the api.
 * JSON-LD: Schema.org `RealEstateAgent` with `address` + `member` array.
 */

export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

type Detail = publicProfileSchemas.PublicAgencyDetail;

async function loadAgency(locale: string, slug: string): Promise<Detail | null> {
  try {
    return await publicApiFetch<Detail>(
      `/api/public/agencies/${encodeURIComponent(slug)}?locale=${locale}`,
      { revalidate: 300 },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const detail = await loadAgency(locale, slug);
  if (!detail) return {};
  const description =
    detail.translation.metaDescription ?? detail.translation.description?.slice(0, 160) ?? null;
  return {
    title: detail.translation.metaTitle ?? detail.name,
    description,
    alternates: localeAlternates({ currentLocale: locale, path: `/agency/${slug}` }),
    openGraph: {
      type: "website",
      locale,
      title: detail.translation.metaTitle ?? detail.name,
      description: description ?? undefined,
      siteName: "Inmolink",
      images: detail.heroImagePublicUrl
        ? [{ url: detail.heroImagePublicUrl }]
        : detail.bannerPublicUrl
          ? [{ url: detail.bannerPublicUrl }]
          : detail.logoPublicUrl
            ? [{ url: detail.logoPublicUrl }]
            : [],
    },
  };
}

export default async function AgencyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const detail = await loadAgency(locale, slug);
  if (!detail) notFound();

  const t = await getTranslations({ locale, namespace: "publicAgency" });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: detail.name,
    url: `${process.env.NEXT_PUBLIC_PUBLIC_URL ?? ""}/${locale}/agency/${detail.slug}`,
    image: detail.logoPublicUrl ?? detail.bannerPublicUrl ?? undefined,
    email: detail.email ?? undefined,
    telephone: detail.phone ?? undefined,
    address: {
      "@type": "PostalAddress",
      addressCountry: detail.countryCode,
    },
    sameAs: [
      detail.website,
      detail.socialFacebook,
      detail.socialInstagram,
      detail.socialLinkedin,
      detail.socialTwitter,
    ].filter((v): v is string => Boolean(v)),
    member: detail.members.map((m) => ({
      "@type": "Person",
      name: `${m.firstName} ${m.lastName}`,
      url: `${process.env.NEXT_PUBLIC_PUBLIC_URL ?? ""}/${locale}/agent/${m.slug}`,
      image: m.photoPublicUrl ?? undefined,
    })),
  };

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD injection requires raw string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative">
        {detail.bannerPublicUrl && (
          <div className="aspect-[3/1] w-full overflow-hidden bg-muted">
            <img
              src={detail.bannerPublicUrl}
              alt={detail.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="container mx-auto -mt-12 max-w-5xl px-4">
          <div className="flex flex-col items-start gap-4 rounded-md border bg-background p-6 shadow-md sm:flex-row sm:items-end">
            {detail.logoPublicUrl && (
              <img
                src={detail.logoPublicUrl}
                alt={detail.name}
                className="h-20 w-20 rounded-md border bg-background object-contain p-2"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold">{detail.name}</h1>
              <p className="text-sm text-muted-foreground">{detail.countryCode}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto max-w-5xl space-y-10 p-6">
        {detail.translation.description && (
          <p className="whitespace-pre-line text-base leading-relaxed">
            {detail.translation.description}
          </p>
        )}

        <ContactRow detail={detail} t={(k) => t(k as "contact" | "website")} />

        {detail.members.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">{t("members")}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {detail.members.map((m) => (
                <li key={m.slug} className="rounded-md border bg-background p-3 shadow-sm">
                  <Link href={`/${locale}/agent/${m.slug}`} className="flex items-center gap-3">
                    {m.photoPublicUrl ? (
                      <img
                        src={m.photoPublicUrl}
                        alt={`${m.firstName} ${m.lastName}`}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                        {m.firstName[0]}
                        {m.lastName[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {m.firstName} {m.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.languagesSpoken.length > 0 ? m.languagesSpoken.join(" · ") : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">
              {t("properties")} ({detail.totalProperties})
            </h2>
            {detail.totalProperties > detail.properties.length && (
              <Link href={`/${locale}/search`} className="text-sm text-primary hover:underline">
                →
              </Link>
            )}
          </div>
          {detail.properties.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("noProperties")}</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {detail.properties.map((p) => (
                <PropertyCard key={p.id} card={p} locale={locale} />
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function ContactRow({
  detail,
  t,
}: {
  detail: Detail;
  t: (k: "contact" | "website") => string;
}) {
  const items: Array<{ label: string; href: string }> = [];
  if (detail.email) items.push({ label: detail.email, href: `mailto:${detail.email}` });
  if (detail.phone) items.push({ label: detail.phone, href: `tel:${detail.phone}` });
  if (detail.website) items.push({ label: t("website"), href: detail.website });
  if (detail.socialFacebook) items.push({ label: "Facebook", href: detail.socialFacebook });
  if (detail.socialInstagram) items.push({ label: "Instagram", href: detail.socialInstagram });
  if (detail.socialLinkedin) items.push({ label: "LinkedIn", href: detail.socialLinkedin });
  if (detail.socialTwitter) items.push({ label: "X / Twitter", href: detail.socialTwitter });
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold">{t("contact")}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <a
              href={i.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PropertyCard({
  card,
  locale,
}: {
  card: publicProfileSchemas.PropertyCard;
  locale: string;
}) {
  const href = `/${locale}/property/${card.slug}-${card.id}`;
  return (
    <li className="overflow-hidden rounded-md border bg-background shadow-sm transition hover:shadow">
      <Link href={href}>
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          {card.coverUrl ? (
            <img
              src={card.coverUrl}
              alt={card.coverAlt ?? card.title}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="p-3">
          <p className="text-sm font-medium">{card.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {card.priceType === "poa" ? "POA" : formatMoney(card.priceCents, card.currency, locale)}
          </p>
        </div>
      </Link>
    </li>
  );
}
