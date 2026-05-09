import { auth, signOut } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sprint 1 status</h2>
        <ul className="list-inside list-disc space-y-1 text-sm">
          <li>Auth.js v5 ✅ — you&apos;re logged in</li>
          <li>Property CRUD API — coming next</li>
          <li>R2 signed-URL upload — after that</li>
          <li>Image variant generation worker — after that</li>
          <li>Property list / create / edit UI — final</li>
        </ul>
      </section>

      <section className="space-y-2 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Session debug:</p>
        <pre className="overflow-x-auto">{JSON.stringify(session, null, 2)}</pre>
      </section>
    </main>
  );
}
