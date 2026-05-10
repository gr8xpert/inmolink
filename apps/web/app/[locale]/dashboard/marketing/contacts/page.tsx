import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteContactAction } from "./actions";
import { ContactForm } from "./contact-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
};

type ContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tags: string[];
  consentGivenAt: string | null;
  unsubscribedAt: string | null;
};

export default async function ContactsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q, tag } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (q) qs.set("q", q);
  if (tag) qs.set("tag", tag);

  let items: ContactRow[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: ContactRow[] }>(
      `/api/dashboard/marketing/contacts?${qs.toString()}`,
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Recipient pool. Tag contacts to filter audience inside campaigns.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/marketing`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Marketing
        </Link>
      </header>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter by email / name…"
          className="input flex-1"
        />
        <input name="tag" defaultValue={tag ?? ""} placeholder="Tag" className="input w-32" />
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Search
        </button>
      </form>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">Add contact</h2>
        <ContactForm locale={locale} />
      </section>

      <section className="space-y-2">
        {items.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border bg-background p-3 shadow-sm"
          >
            <div>
              <p className="font-medium">
                {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.email}
                {c.tags.length > 0 && <> · {c.tags.join(", ")}</>}
                {c.unsubscribedAt && (
                  <>
                    {" "}
                    · <span className="text-red-700">unsubscribed</span>
                  </>
                )}
              </p>
            </div>
            <form action={deleteContactAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 hover:bg-red-100"
              >
                Delete
              </button>
            </form>
          </div>
        ))}
        {items.length === 0 && !listError && (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        )}
      </section>
    </main>
  );
}
