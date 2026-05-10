import { localeAlternates } from "@/lib/seo";
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

  return <Home locale={locale} />;
}

function Home({ locale }: { locale: string }) {
  const t = useTranslations("site");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-24">
      <h1 className="text-5xl font-bold">{t("name")}</h1>
      <p className="text-xl text-muted-foreground">{t("tagline")}</p>
      <Link
        href={`/${locale}/search`}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
      >
        Browse properties →
      </Link>
    </main>
  );
}
