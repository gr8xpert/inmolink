import { Button } from "@/components/dashboard/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import { Users } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Contacts"
        description="Recipient pool. Tag contacts to filter audience inside campaigns."
      />

      <form className="mb-6 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter by email / name…"
          className="input flex-1 min-w-[200px]"
        />
        <input name="tag" defaultValue={tag ?? ""} placeholder="Tag" className="input w-32" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {listError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <SurfaceCard title="Add contact" className="mb-6">
        <ContactForm locale={locale} />
      </SurfaceCard>

      <SurfaceCard title="Contact list" flush>
        {items.length === 0 && !listError ? (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Add your first contact above to build a recipient pool."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.email}
                    {c.tags.length > 0 && <> · {c.tags.join(", ")}</>}
                    {c.unsubscribedAt && <span className="text-danger"> · unsubscribed</span>}
                  </p>
                </div>
                <form action={deleteContactAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" size="sm" variant="secondary">
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </div>
  );
}
