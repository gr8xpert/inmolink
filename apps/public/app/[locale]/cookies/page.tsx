import { LEGAL_LAST_UPDATED, loadLegalHtml } from "@/lib/legal";
import { localeAlternates } from "@/lib/seo";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Cookie policy · Inmolink",
    description: "Which cookies Inmolink uses and why.",
    alternates: localeAlternates({ currentLocale: locale, path: "/cookies" }),
    robots: { index: true, follow: true },
  };
}

export default async function CookiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const html = await loadLegalHtml(locale, "cookies");

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-6 py-16 text-sm leading-relaxed">
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">Cookie policy</h1>
        <p className="text-muted-foreground">
          Last updated: {LEGAL_LAST_UPDATED}.{" "}
          <strong>Placeholder copy — pending legal review.</strong>
        </p>
      </header>

      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content authored
          by us in apps/public/content/legal/<locale>/cookies.html, no user
          input. Review changes via git diff before merging. */}
      <section className="space-y-4" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
