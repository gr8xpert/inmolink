import { PageHeader } from "@/components/dashboard/page-header";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminPropertyTypeSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Property types"
        description="Groups + types with translations, Lucide icons (AI-suggested), and reordering."
      />

      <AdminPropertyTypes locale={locale} groups={groups.items} types={types.items} />
    </div>
  );
}
