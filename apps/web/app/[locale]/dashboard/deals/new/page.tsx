import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="Submit deal" />

      <SurfaceCard>
        <DealForm locale={locale} initialViewingRequestId={sp.viewingRequestId ?? ""} />
      </SurfaceCard>
    </div>
  );
}
