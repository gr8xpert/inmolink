import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminFeedTypeMapSchemas, taxonomySchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FeedTypeMaps } from "./feed-type-maps";

type Props = { params: Promise<{ locale: string }> };

type MapsResponse = { items: adminFeedTypeMapSchemas.AdminFeedTypeMap[] };
type TypesResponse = { items: taxonomySchemas.PropertyTypeListItem[] };

export default async function AdminFeedTypeMapsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let maps: MapsResponse;
  let types: TypesResponse;
  try {
    [maps, types] = await Promise.all([
      apiFetch<MapsResponse>("/api/dashboard/admin/feed-type-maps"),
      apiFetch<TypesResponse>(`/api/dashboard/property-types?locale=${locale}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Feed type mappings</h1>
          <p className="text-sm text-muted-foreground">
            Map raw connector labels (Kyero "Townhouse", Resale "Adosado", …) to canonical property
            types so imports route correctly. Unmapped labels still fall back to a translation
            match; failing both, the property is imported in DRAFT.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <FeedTypeMaps locale={locale} initialMaps={maps.items} types={types.items} />
    </main>
  );
}
