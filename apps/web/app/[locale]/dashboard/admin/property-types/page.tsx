import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminPropertyTypeSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPropertyTypes } from "./admin-property-types";

type Props = {
  params: Promise<{ locale: string }>;
};

type GroupsResponse = { items: adminPropertyTypeSchemas.AdminPropertyTypeGroup[] };
type TypesResponse = { items: adminPropertyTypeSchemas.AdminPropertyType[] };

export default async function AdminPropertyTypesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let groups: GroupsResponse;
  let types: TypesResponse;
  try {
    [groups, types] = await Promise.all([
      apiFetch<GroupsResponse>("/api/dashboard/admin/property-type-groups"),
      apiFetch<TypesResponse>("/api/dashboard/admin/property-types"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Property types</h1>
          <p className="text-sm text-muted-foreground">
            Groups + types with translations, Lucide icons (AI-suggested), and reordering.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <AdminPropertyTypes locale={locale} groups={groups.items} types={types.items} />
    </main>
  );
}
