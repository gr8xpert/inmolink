import { env } from "@/env";
import { ApiError, publicApiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { safeJsonLd } from "@/lib/json-ld";
import { localeAlternates } from "@/lib/seo";
import type { publicProfileSchemas } from "@inmolink/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Public agent landing — PLAN §8.
 *
 * ISR 5min. Hard-filtered to active + public-profile-enabled users in
 * active + public agencies. JSON-LD: Schema.org `Person` with `worksFor`.
 */

export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };
type Detail = publicProfileSchemas.PublicAgentDetail;

async function loadAgent(locale: string, slug: string): Promise<Detail | null> {
  try {
    return await publicApiFetch<Detail>(
      `/api/public/agents/${encodeURIComponent(slug)}?locale=${locale}`,
      { revalidate: 300 },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const detail = await loadAgent(locale, slug);
  if (!detail) return {};
  const fullName = `${detail.firstName} ${detail.lastName}`;
  return {
    title: `${fullName} — ${detail.agency.name}`,
    description: detail.bio?.slice(0, 160) ?? `Agent at ${detail.agency.name}`,
    alternates: localeAlternates({ currentLocale: locale, path: `/agent/${slug}` }),
    openGraph: {
      type: "profile",
      locale,
      title: fullName,
      description: detail.bio ?? undefined,
      siteName: "Inmolink",
      images: detail.photoPublicUrl ? [{ url: detail.photoPublicUrl }] : [],
    },
  };
}

export default async function AgentPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const detail = await loadAgent(locale, slug);
  if (!detail) notFound();

  const t = await getTranslations({ locale, namespace: "publicAgency" });
  const fullName = `${detail.firstName} ${detail.lastName}`;
  const baseUrl = env.NEXT_PUBLIC_PUBLIC_URL;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: fullName,
    url: `${baseUrl}/${locale}/agent/${detail.slug}`,
    image: detail.photoPublicUrl ?? undefined,
    telephone: detail.phone ?? undefined,
    knowsLanguage: detail.languagesSpoken.length > 0 ? detail.languagesSpoken : undefined,
    worksFor: {
      "@type": "RealEstateAgent",
      name: detail.agency.name,
      url: `${baseUrl}/${locale}/agency/${detail.agency.slug}`,
      image: detail.agency.logoPublicUrl ?? undefined,
    },
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-10 p-6 pt-12">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw HTML; safeJsonLd escapes script-breakout chars
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {detail.photoPublicUrl ? (
          <img
            src={detail.photoPublicUrl}
            alt={fullName}
            className="h-32 w-32 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-muted text-2xl font-medium uppercase text-muted-foreground">
            {detail.firstName[0]}
            {detail.lastName[0]}
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{fullName}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/${locale}/agency/${detail.agency.slug}`} className="hover:underline">
              {detail.agency.name}
            </Link>
          </p>
          {detail.languagesSpoken.length > 0 && (
            <p className="text-xs text-muted-foreground">{detail.languagesSpoken.join(" · ")}</p>
          )}
        </div>
      </header>

      {detail.bio && <p className="whitespace-pre-line text-base leading-relaxed">{detail.bio}</p>}

      {(detail.phone || detail.whatsappNumber) && (
        <section>
          <h2 className="text-xl font-semibold">{t("contact")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {detail.phone && (
              <li>
                <a
                  href={`tel:${detail.phone}`}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {detail.phone}
                </a>
              </li>
            )}
            {detail.whatsappNumber && (
              <li>
                <a
                  href={`https://wa.me/${detail.whatsappNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                >
                  WhatsApp
                </a>
              </li>
            )}
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
              <li
                key={p.id}
                className="overflow-hidden rounded-md border bg-background shadow-sm transition hover:shadow"
              >
                <Link href={`/${locale}/property/${p.slug}-${p.id}`}>
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                    {p.coverUrl && (
                      <img
                        src={p.coverUrl}
                        alt={p.coverAlt ?? p.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.priceType === "poa"
                        ? "POA"
                        : formatMoney(p.priceCents, p.currency, locale)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
