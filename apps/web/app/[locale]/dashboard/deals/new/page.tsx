import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealForm } from "../deal-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ viewingRequestId?: string }>;
};

export default async function NewDealPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  return (
    <main className="container mx-auto max-w-2xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Submit deal</h1>
        <Link
          href={`/${locale}/dashboard/deals`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Deals
        </Link>
      </header>
      <DealForm locale={locale} initialViewingRequestId={sp.viewingRequestId ?? ""} />
    </main>
  );
}
