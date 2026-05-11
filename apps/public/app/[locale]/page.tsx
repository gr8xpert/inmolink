import { env } from "@/env";
import { publicApiFetch } from "@/lib/api";
import { localeAlternates } from "@/lib/seo";
import type { marketingSchemas } from "@inmolink/shared";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    title: t("name"),
    description: t("tagline"),
    alternates: localeAlternates({ currentLocale: locale, path: "/" }),
    openGraph: {
      type: "website",
      locale,
      title: t("name"),
      description: t("tagline"),
      siteName: "Inmolink",
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Featured listings — Sprint 8. Soft-fail to an empty list if the api
  // is degraded so the homepage stays renderable.
  let featured: marketingSchemas.PublicFeaturedPropertyCard[] = [];
  try {
    const r = await publicApiFetch<{ items: marketingSchemas.PublicFeaturedPropertyCard[] }>(
      `/api/public/featured-listings?surface=PUBLIC_HOME&locale=${encodeURIComponent(locale)}&limit=6`,
      { revalidate: 600 },
    );
    featured = r.items;
  } catch {
    // ignored
  }

  return <Home locale={locale} featured={featured} />;
}

function Home({
  locale,
  featured,
}: {
  locale: string;
  featured: marketingSchemas.PublicFeaturedPropertyCard[];
}) {
  const t = useTranslations("site");

  return (
    <main className="container mx-auto flex min-h-screen flex-col gap-12 px-6 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-bold">{t("name")}</h1>
        <p className="text-xl text-muted-foreground">{t("tagline")}</p>
        <Link
          href={`/${locale}/search`}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          Browse properties →
        </Link>
      </section>

      {featured.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Featured listings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <Link
                key={p.propertyId}
                href={`/${locale}/property/${p.slug}-${p.propertyId}`}
                className="group rounded-lg border bg-background shadow-sm transition hover:shadow-md"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-t-lg bg-muted">
                  {p.coverImageHash ? (
                    <img
                      src={`${env.NEXT_PUBLIC_API_URL}/api/_local-storage/serve?key=${encodeURIComponent(`media/${p.coverImageHash.slice(0, 2)}/${p.coverImageHash.slice(2, 4)}/${p.coverImageHash}`)}`}
                      alt={p.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <h3 className="line-clamp-1 font-semibold">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {(p.priceCents / 100).toLocaleString(locale, {
                      style: "currency",
                      currency: p.currency,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.bedrooms != null && <>{p.bedrooms} bd · </>}
                    {p.bathrooms != null && <>{p.bathrooms} ba · </>}
                    {p.areaM2 != null && <>{p.areaM2} m² · </>}
                    {p.agencyName}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
