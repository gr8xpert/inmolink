import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title={t("new.title")} />

      <SurfaceCard>
        <ViewingRequestForm locale={locale} initialPropertyId={sp.propertyId ?? ""} />
      </SurfaceCard>
    </div>
  );
}
