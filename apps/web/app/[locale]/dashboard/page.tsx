import { auth, signOut } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardHome({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  async function logout() {
    "use server";
    await signOut({ redirectTo: `/${locale}/sign-in` });
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.user.name} ({session.user.role})
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Sign out
          </button>
        </form>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/${locale}/dashboard/properties`}
          className="rounded-md border bg-background p-4 shadow-sm transition hover:bg-muted/30"
        >
          <h2 className="font-semibold">Properties</h2>
          <p className="text-sm text-muted-foreground">
            Browse + manage listings (your own and the agency&apos;s shared inventory).
          </p>
        </Link>
      </section>

      <section className="space-y-2 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Session debug:</p>
        <pre className="overflow-x-auto">{JSON.stringify(session, null, 2)}</pre>
      </section>
    </main>
  );
}
