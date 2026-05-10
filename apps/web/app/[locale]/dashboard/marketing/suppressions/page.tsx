import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { removeSuppressionAction } from "./actions";
import { AddSuppressionForm } from "./add-form";

type Props = { params: Promise<{ locale: string }> };

type SuppressionRow = {
  id: string;
  email: string;
  reason: marketingSchemas.SuppressionReason;
  notes: string | null;
  createdAt: string;
};

export default async function SuppressionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let items: SuppressionRow[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: SuppressionRow[] }>(
      "/api/dashboard/marketing/suppressions?limit=200",
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Suppressions</h1>
          <p className="text-sm text-muted-foreground">
            Hard blocks. We never send to addresses on this list — bounces and unsubscribes are
            added automatically.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/marketing`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Marketing
        </Link>
      </header>

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">Manually add</h2>
        <AddSuppressionForm locale={locale} />
      </section>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="space-y-2">
        {items.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border bg-background p-3 shadow-sm"
          >
            <div>
              <p className="font-medium">{s.email}</p>
              <p className="text-xs text-muted-foreground">
                {s.reason} · {new Date(s.createdAt).toLocaleString(locale)}
                {s.notes && <> · {s.notes}</>}
              </p>
            </div>
            <form action={removeSuppressionAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Remove
              </button>
            </form>
          </div>
        ))}
        {items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No suppressions.</p>
        )}
      </section>
    </main>
  );
}
