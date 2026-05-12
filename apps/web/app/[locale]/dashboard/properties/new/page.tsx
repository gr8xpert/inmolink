import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { taxonomySchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PropertyForm } from "../_components/property-form";

type Props = {
  params: Promise<{ locale: string }>;
};

type TypesResponse = { items: taxonomySchemas.PropertyTypeListItem[] };
type LocationsResponse = { items: taxonomySchemas.LocationListItem[] };

export default async function NewPropertyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  let types: TypesResponse;
  let locations: LocationsResponse;
  try {
    [types, locations] = await Promise.all([
      apiFetch<TypesResponse>(`/api/dashboard/property-types?locale=${locale}`),
      apiFetch<LocationsResponse>(`/api/dashboard/locations?locale=${locale}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="New property"
        description="Required fields: transaction, price, type, location, English title + description."
      />

      <SurfaceCard>
        <PropertyForm
          mode="create"
          locale={locale}
          propertyTypes={types.items}
          locations={locations.items}
        />
      </SurfaceCard>
    </div>
  );
}
