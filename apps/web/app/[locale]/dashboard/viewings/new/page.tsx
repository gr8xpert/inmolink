import { auth } from "@inmolink/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ViewingRequestForm } from "../viewing-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ propertyId?: string }>;
};

export default async function NewViewingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  const t = await getTranslations({ locale, namespace: "viewings" });

  return (
    <main className="container mx-auto max-w-2xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">{t("new.title")}</h1>
        <Link
          href={`/${locale}/dashboard/viewings`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← {t("back")}
        </Link>
      </header>
      <ViewingRequestForm locale={locale} initialPropertyId={sp.propertyId ?? ""} />
    </main>
  );
}
