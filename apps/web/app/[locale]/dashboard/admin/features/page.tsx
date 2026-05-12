import { PageHeader } from "@/components/dashboard/page-header";
import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { adminFeatureSchemas } from "@inmolink/shared";
import { setRequestLocale } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Features"
        description="Amenity catalog (pool, parking, sea view, …). Translations + Lucide icons + AI suggester."
      />

      <AdminFeatures locale={locale} groups={groups.items} features={features.items} />
    </div>
  );
}
