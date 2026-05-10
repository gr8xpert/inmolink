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

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-6 py-16 text-sm leading-relaxed">
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">Cookie policy</h1>
        <p className="text-muted-foreground">
          Last updated: 2026-05-10. <strong>Placeholder copy — pending legal review.</strong>
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">What are cookies?</h2>
        <p>
          Cookies are small text files stored in your browser. We keep our cookie use minimal: we do
          not run advertising or cross-site tracking cookies.
        </p>

        <h2 className="text-xl font-semibold">Cookies we use</h2>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/40 text-left uppercase tracking-wide">
            <tr>
              <th className="border-b border-r p-2">Name</th>
              <th className="border-b border-r p-2">Purpose</th>
              <th className="border-b border-r p-2">Type</th>
              <th className="border-b p-2">Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-r p-2 font-mono">authjs.session-token</td>
              <td className="border-r p-2">Session — keeps you signed in</td>
              <td className="border-r p-2">Strictly necessary</td>
              <td className="p-2">30 days</td>
            </tr>
            <tr>
              <td className="border-r p-2 font-mono">authjs.csrf-token</td>
              <td className="border-r p-2">CSRF protection on auth endpoints</td>
              <td className="border-r p-2">Strictly necessary</td>
              <td className="p-2">Session</td>
            </tr>
            <tr>
              <td className="border-r p-2 font-mono">NEXT_LOCALE</td>
              <td className="border-r p-2">Remembers your language choice</td>
              <td className="border-r p-2">Functional</td>
              <td className="p-2">1 year</td>
            </tr>
            <tr>
              <td className="border-r p-2 font-mono">inmolink-consent</td>
              <td className="border-r p-2">Records your cookie banner choice</td>
              <td className="border-r p-2">Strictly necessary</td>
              <td className="p-2">1 year</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-xl font-semibold">What we don&apos;t use</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Google Analytics, Meta Pixel, or any third-party advertising tracker.</li>
          <li>Cross-site tracking cookies of any kind.</li>
          <li>
            Server-side fingerprinting (we hash IP addresses with a salted SHA-256 for lead
            anti-abuse only).
          </li>
        </ul>

        <h2 className="text-xl font-semibold">Changing your choice</h2>
        <p>
          The consent banner appears on your first visit. Clear the{" "}
          <code className="rounded bg-muted px-1 py-0.5">inmolink-consent</code> cookie via your
          browser settings to see it again. We&apos;ll add a self-serve &quot;manage cookies&quot;
          dialog in a future release.
        </p>

        <h2 className="text-xl font-semibold">Questions</h2>
        <p>
          <a href="mailto:privacy@inmolink.eu" className="text-blue-700 hover:underline">
            privacy@inmolink.eu
          </a>{" "}
          — see our{" "}
          <a href={`/${locale}/privacy`} className="text-blue-700 hover:underline">
            privacy policy
          </a>{" "}
          for the full picture.
        </p>
      </section>
    </main>
  );
}
