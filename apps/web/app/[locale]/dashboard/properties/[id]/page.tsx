import { LinkButton } from "@/components/dashboard/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SurfaceCard } from "@/components/dashboard/surface-card";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { auth } from "@inmolink/auth";
import type { propertyImageSchemas, propertySchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ImageManager } from "./image-manager";
import { ImageUploader } from "./image-uploader";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

type Detail = propertySchemas.PropertyDetail;
type ImageList = { images: propertyImageSchemas.PropertyImageDto[] };

export default async function PropertyDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "properties" });

  let property: Detail;
  let images: ImageList;
  try {
    [property, images] = await Promise.all([
      apiFetch<Detail>(`/api/dashboard/properties/${encodeURIComponent(id)}`),
      apiFetch<ImageList>(`/api/dashboard/properties/${encodeURIComponent(id)}/images`),
    ]);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect(`/${locale}/sign-in`);
      if (err.status === 404) notFound();
    }
    throw err;
  }

  // Pick best translation: requested locale → en → first available.
  const tr =
    property.translations.find((x) => x.locale === locale) ??
    property.translations.find((x) => x.locale === "en") ??
    property.translations[0] ??
    null;

  // Same matrix as apps/api/src/modules/properties/service.ts ownershipMatches —
  // SUPER_ADMIN, AGENCY_ADMIN of owning agency, AGENT owner.
  const role = session.user.role;
  const isOwner =
    role === "SUPER_ADMIN" ||
    (role === "AGENCY_ADMIN" && session.user.agencyId === property.ownerAgencyId) ||
    (role === "AGENT" && session.user.id === property.ownerUserId);

  const cover = images.images.find((i) => i.isCover) ?? images.images[0] ?? null;
  const gallery = images.images.filter((i) => i.id !== cover?.id);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={tr?.title ?? t("untitled")}
        description={`#${property.id}`}
        actions={
          isOwner ? (
            <LinkButton href={`/${locale}/dashboard/properties/${property.id}/edit`}>
              {t("edit")}
            </LinkButton>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {cover ? (
          <section className="surface overflow-hidden">
            {/* Plain <img> — variant URLs land in slice G; for now we render
                the source MediaObject directly. */}
            <img
              src={cover.publicUrl}
              alt={cover.altText ?? ""}
              className="block h-auto w-full object-cover"
            />
          </section>
        ) : (
          <SurfaceCard>
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noImages")}</p>
          </SurfaceCard>
        )}

        <SurfaceCard title={t("status.label")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow
              label={t("price")}
              value={formatMoney(property.priceCents, property.currency, locale)}
            />
            <DetailRow label={t("status.label")} value={t(`status.${property.status}`)} />
            <DetailRow
              label={t("transactionType")}
              value={t(`transaction.${property.transactionType}`)}
            />
            <DetailRow
              label={t("visibility.label")}
              value={t(`visibility.${property.visibility}`)}
            />
            {property.bedrooms !== null && (
              <DetailRow label={t("bedroomsLabel")} value={String(property.bedrooms)} />
            )}
            {property.bathrooms !== null && (
              <DetailRow label={t("bathroomsLabel")} value={String(property.bathrooms)} />
            )}
            {property.areaM2 !== null && (
              <DetailRow label={t("areaLabel")} value={`${property.areaM2} m²`} />
            )}
            {property.plotM2 !== null && (
              <DetailRow label={t("plotLabel")} value={`${property.plotM2} m²`} />
            )}
            {property.yearBuilt !== null && (
              <DetailRow label={t("yearBuiltLabel")} value={String(property.yearBuilt)} />
            )}
            <DetailRow label={t("createdAt")} value={formatDate(property.createdAt, locale)} />
          </div>
        </SurfaceCard>

        {tr?.description && (
          <SurfaceCard title={t("description")}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {tr.description}
            </p>
          </SurfaceCard>
        )}

        {/* Owners get the full management UI — gallery is replaced by an
            editable list. Non-owners see a read-only thumbnail grid. */}
        {isOwner ? (
          <ImageManager locale={locale} propertyId={property.id} images={images.images} />
        ) : (
          gallery.length > 0 && (
            <SurfaceCard title={t("gallery")}>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {gallery.map((img) => (
                  <li key={img.id} className="overflow-hidden rounded-md border border-border">
                    <img
                      src={img.publicUrl}
                      alt={img.altText ?? ""}
                      className="block aspect-square w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          )
        )}

        {isOwner && (
          <SurfaceCard title={t("uploadImages")}>
            <ImageUploader locale={locale} propertyId={property.id} />
          </SurfaceCard>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
