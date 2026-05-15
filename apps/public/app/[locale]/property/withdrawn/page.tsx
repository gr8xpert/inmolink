import { setRequestLocale } from "next-intl/server";
import Link from "next/link";

/**
 * Withdrawn-property landing page.
 *
 * Deleted public property URLs 301 here instead of 404 so we preserve the
 * SEO equity Google already crawled for the old slug. The page tells the
 * user the listing is gone and points them at the locale search — the
 * "similar listings" content can be wired in once we have a cheap
 * recommendation source.
 */

export const dynamic = "force-static";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PropertyWithdrawnPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">This listing is no longer available</h1>
      <p className="mt-3 text-muted-foreground">
        The property you were looking at has been withdrawn or sold. Browse our current listings to
        find similar properties.
      </p>
      <div className="mt-8">
        <Link
          href={`/${locale}/search`}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          See similar listings
        </Link>
      </div>
    </main>
  );
}
