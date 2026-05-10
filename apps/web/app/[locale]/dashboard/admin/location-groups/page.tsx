import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminLocationGroupSchemas, adminLocationSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
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
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Location groups</h1>
          <p className="text-sm text-muted-foreground">
            Editorial bundles like &ldquo;Costa del Sol&rdquo; that aggregate locations outside the
            strict tree. Translations + member picker + per-member reorder.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <AdminLocationGroups locale={locale} groups={groups.items} allLocations={locations.items} />
    </main>
  );
}
