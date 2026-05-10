import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TicketCreateForm } from "./create-form";

type Props = { params: Promise<{ locale: string }> };

export default async function NewTicketPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  return (
    <main className="container mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">New ticket</h1>
          <p className="text-sm text-muted-foreground">
            Describe what you need help with. Super-admin will respond.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/tickets`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Tickets
        </Link>
      </header>

      <TicketCreateForm locale={locale} />
    </main>
  );
}
