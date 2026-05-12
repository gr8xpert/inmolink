import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ImportForm } from "../import-form";

type Props = { params: Promise<{ locale: string }> };

export default async function NewImportPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "imports" });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title={t("create.title")} />

      <SurfaceCard>
        <ImportForm locale={locale} mode="create" />
      </SurfaceCard>
    </div>
  );
}
