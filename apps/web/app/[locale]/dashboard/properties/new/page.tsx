import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { taxonomySchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PropertyCreateForm } from "./property-form";

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
    <main className="container mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">New property</h1>
          <p className="text-sm text-muted-foreground">
            Required fields: transaction, price, type, location, English title + description.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/properties`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </Link>
      </header>

      <PropertyCreateForm locale={locale} propertyTypes={types.items} locations={locations.items} />
    </main>
  );
}
