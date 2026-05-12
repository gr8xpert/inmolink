import { PageHeader } from "@/components/dashboard/page-header";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminLocationSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminLocations } from "./admin-locations";

type Props = {
  params: Promise<{ locale: string }>;
};

type LocationsResponse = { items: adminLocationSchemas.AdminLocation[] };

export default async function AdminLocationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let data: LocationsResponse;
  try {
    data = await apiFetch<LocationsResponse>("/api/dashboard/admin/locations");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Locations"
        description="4-level tree (Country → Region → City → Area). Translations + lat/long + SEO meta."
      />

      <AdminLocations locale={locale} locations={data.items} />
    </div>
  );
}
