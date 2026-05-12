import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { TicketCreateForm } from "./create-form";

type Props = { params: Promise<{ locale: string }> };

export default async function NewTicketPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="New ticket"
        description="Describe what you need help with. Super-admin will respond."
      />

      <SurfaceCard>
        <TicketCreateForm locale={locale} />
      </SurfaceCard>
    </div>
  );
}
