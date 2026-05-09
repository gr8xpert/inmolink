import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Home />;
}

function Home() {
  const t = useTranslations("site");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
      <h1 className="text-5xl font-bold">{t("name")}</h1>
      <p className="text-xl text-muted-foreground">{t("tagline")}</p>
      <p className="text-sm text-muted-foreground">
        Public marketplace scaffold — Sprint 0. Property search + detail pages land in Sprint 3.
      </p>
    </main>
  );
}
