import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminFeatureSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminFeatures } from "./admin-features";

type Props = {
  params: Promise<{ locale: string }>;
};

type GroupsResponse = { items: adminFeatureSchemas.AdminFeatureGroup[] };
type FeaturesResponse = { items: adminFeatureSchemas.AdminFeature[] };

export default async function AdminFeaturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/dashboard`);

  let groups: GroupsResponse;
  let features: FeaturesResponse;
  try {
    [groups, features] = await Promise.all([
      apiFetch<GroupsResponse>("/api/dashboard/admin/feature-groups"),
      apiFetch<FeaturesResponse>("/api/dashboard/admin/features"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(`/${locale}/sign-in`);
    throw err;
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Features</h1>
          <p className="text-sm text-muted-foreground">
            Amenity catalog (pool, parking, sea view, …). Translations + Lucide icons + AI
            suggester.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/admin`}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Admin
        </Link>
      </header>

      <AdminFeatures locale={locale} groups={groups.items} features={features.items} />
    </main>
  );
}
