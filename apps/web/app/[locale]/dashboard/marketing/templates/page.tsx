import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { marketingSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteTemplateAction } from "./actions";
import { TemplateForm } from "./template-form";

type Props = { params: Promise<{ locale: string }> };

export default async function TemplatesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role === "AGENT") redirect(`/${locale}/dashboard`);

  let items: marketingSchemas.EmailTemplate[] = [];
  let listError: string | null = null;
  try {
    const r = await apiFetch<{ items: marketingSchemas.EmailTemplate[] }>(
      "/api/dashboard/marketing/templates",
    );
    items = r.items;
  } catch (err) {
    listError = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Email templates</h1>
          <p className="text-sm text-muted-foreground">
            Merge tags: {"{{contact.firstName}}"} {"{{agency.name}}"} {"{{property.title}}"}{" "}
            {"{{unsubscribeUrl}}"}.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/marketing`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Marketing
        </Link>
      </header>

      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {listError}
        </div>
      )}

      <section className="rounded-md border bg-background p-4 shadow-sm">
        <h2 className="font-semibold">New template</h2>
        <TemplateForm locale={locale} />
      </section>

      <section className="space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-md border bg-background p-3 shadow-sm"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.subject}</p>
            </div>
            <form action={deleteTemplateAction}>
              <input type="hidden" name="id" value={t.id} />
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
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        )}
      </section>
    </main>
  );
}
