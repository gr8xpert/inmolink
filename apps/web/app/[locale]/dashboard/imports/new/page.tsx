import { auth } from "@inmolink/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-2xl space-y-6 p-8">
      <div className="border-b pb-4">
        <Link
          href={`/${locale}/dashboard/imports`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t("create.title")}</h1>
      </div>
      <ImportForm locale={locale} mode="create" />
    </main>
  );
}
