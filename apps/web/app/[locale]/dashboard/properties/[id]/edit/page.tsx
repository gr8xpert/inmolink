import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { propertySchemas, taxonomySchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { PropertyForm } from "../../_components/property-form";
import { FieldLocksManager } from "./field-locks-manager";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

type Detail = propertySchemas.PropertyDetail;
type TypesResponse = { items: taxonomySchemas.PropertyTypeListItem[] };
type LocationsResponse = { items: taxonomySchemas.LocationListItem[] };

export default async function EditPropertyPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  let property: Detail;
  let types: TypesResponse;
  let locations: LocationsResponse;
  try {
    [property, types, locations] = await Promise.all([
      apiFetch<Detail>(`/api/dashboard/properties/${encodeURIComponent(id)}`),
      apiFetch<TypesResponse>(`/api/dashboard/property-types?locale=${locale}`),
      apiFetch<LocationsResponse>(`/api/dashboard/locations?locale=${locale}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect(`/${locale}/sign-in`);
      if (err.status === 404) notFound();
    }
    throw err;
  }

  // Ownership gate matching the api service. Non-owners can read the
  // detail page but never the edit page.
  const role = session.user.role;
  const isOwner =
    role === "SUPER_ADMIN" ||
    (role === "AGENCY_ADMIN" && session.user.agencyId === property.ownerAgencyId) ||
    (role === "AGENT" && session.user.id === property.ownerUserId);
  if (!isOwner) {
    redirect(`/${locale}/dashboard/properties/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Edit property" description={`#${property.id}`} />

      <div className="space-y-6">
        <SurfaceCard>
          <PropertyForm
            mode="edit"
            locale={locale}
            propertyId={id}
            initial={property}
            propertyTypes={types.items}
            locations={locations.items}
          />
        </SurfaceCard>

        <FieldLocksManager
          locale={locale}
          propertyId={id}
          source={property.source}
          initialLocked={property.lockedFields}
        />
      </div>
    </div>
  );
}
