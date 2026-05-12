import { PageHeader } from "@/components/dashboard/page-header";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminLocationGroupSchemas, adminLocationSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminLocationGroups } from "./admin-location-groups";

type Props = {
  params: Promise<{ locale: string }>;
};

type GroupsResponse = { items: adminLocationGroupSchemas.AdminLocationGroup[] };
type LocationsResponse = { items: adminLocationSchemas.AdminLocation[] };

export default async function AdminLocationGroupsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let groups: GroupsResponse;
  let locations: LocationsResponse;
  try {
    [groups, locations] = await Promise.all([
      apiFetch<GroupsResponse>("/api/dashboard/admin/location-groups"),
      apiFetch<LocationsResponse>("/api/dashboard/admin/locations"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Location groups"
        description={`Editorial bundles like "Costa del Sol" that aggregate locations outside the strict tree. Translations + member picker + per-member reorder.`}
      />

      <AdminLocationGroups locale={locale} groups={groups.items} allLocations={locations.items} />
    </div>
  );
}
