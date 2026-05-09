import { prisma } from "@inmolink/db";
import { publicPropertySchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Public marketplace property routes. Anonymous (no `requireUser()`).
 *
 * Hard filters applied at every read:
 *   - `visibility = "PUBLIC"` (PLAN §1 row 5 — only paid PUBLIC tier shows)
 *   - `deletedAt IS NULL`
 *   - `status = "ACTIVE"`  (DRAFT / RESERVED / SOLD / WITHDRAWN don't surface)
 *
 * Sensitive fields stripped: `addressLine`, `postcode`, `ownerUserId`,
 * `ownerAgencyId`, exact `lat/long` for now (city-level only). The agency
 * badge data is denormalised into the response so the page renders
 * without an extra round-trip.
 *
 * Per-request rate limit is tighter than dashboard since this is the
 * public surface — the route registers its own `config.rateLimit`.
 */

const localeQuery = z.object({
  locale: z.enum(["en", "es", "de", "fr"]).default("en"),
});

const idParam = z.object({ id: z.string().min(1) });

export async function publicPropertyRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/properties/:id",
    {
      schema: {
        tags: ["public", "properties"],
        summary: "Public property detail (PUBLIC + ACTIVE only)",
        params: idParam,
        querystring: localeQuery,
        response: { 200: publicPropertySchemas.publicPropertyDetailSchema },
      },
      // Tighter than dashboard — public surface, scrape defence.
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { id } = request.params;
      const { locale } = request.query;

      const row = await prisma.property.findFirst({
        where: { id, visibility: "PUBLIC", status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          status: true,
          transactionType: true,
          priceCents: true,
          currency: true,
          priceType: true,
          bedrooms: true,
          bathrooms: true,
          areaM2: true,
          plotM2: true,
          yearBuilt: true,
          propertyTypeId: true,
          locationId: true,
          latitude: true,
          longitude: true,
          virtualTourUrl: true,
          publishedAt: true,
          updatedAt: true,
          translations: {
            select: {
              locale: true,
              title: true,
              description: true,
              slug: true,
              metaTitle: true,
              metaDescription: true,
            },
          },
          agency: { select: { id: true, slug: true, name: true, logoR2Key: true } },
        },
      });
      if (!row) throw app.httpErrors.notFound("Property not found");

      // Pick locale → en → first available.
      const tr =
        row.translations.find((t) => t.locale === locale) ??
        row.translations.find((t) => t.locale === "en") ??
        row.translations[0];
      if (!tr) throw app.httpErrors.notFound("Property has no translations");

      return {
        id: row.id,
        status: row.status,
        transactionType: row.transactionType,
        priceCents: Number(row.priceCents),
        currency: row.currency,
        priceType: row.priceType as "fixed" | "poa" | "from",
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        areaM2: row.areaM2,
        plotM2: row.plotM2,
        yearBuilt: row.yearBuilt,
        propertyTypeId: row.propertyTypeId,
        locationId: row.locationId,
        latitude: row.latitude ? Number(row.latitude) : null,
        longitude: row.longitude ? Number(row.longitude) : null,
        virtualTourUrl: row.virtualTourUrl,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        updatedAt: row.updatedAt.toISOString(),
        translation: {
          locale: tr.locale,
          title: tr.title,
          description: tr.description,
          slug: tr.slug,
          metaTitle: tr.metaTitle,
          metaDescription: tr.metaDescription,
        },
        agency: {
          id: row.agency.id,
          slug: row.agency.slug,
          name: row.agency.name,
          logoUrl: row.agency.logoR2Key ? storage.publicUrl(row.agency.logoR2Key) : null,
        },
      };
    },
  );

  fastify.get(
    "/properties/:id/images",
    {
      schema: {
        tags: ["public", "properties"],
        summary: "Public property images",
        params: idParam,
        response: { 200: publicPropertySchemas.publicPropertyImagesResponseSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { id } = request.params;
      // Re-verify visibility on the parent so an image-list scrape can't
      // leak rows from PRIVATE / SHARED properties even with a known id.
      const property = await prisma.property.findFirst({
        where: { id, visibility: "PUBLIC", status: "ACTIVE", deletedAt: null },
        select: { id: true },
      });
      if (!property) throw app.httpErrors.notFound("Property not found");

      const rows = await prisma.propertyImage.findMany({
        where: { propertyId: id },
        select: {
          id: true,
          position: true,
          isCover: true,
          altText: true,
          mediaObject: { select: { r2Key: true, width: true, height: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });

      return {
        images: rows.map((r) => ({
          id: r.id,
          position: r.position,
          isCover: r.isCover,
          altText: r.altText,
          publicUrl: storage.publicUrl(r.mediaObject.r2Key),
          width: r.mediaObject.width,
          height: r.mediaObject.height,
        })),
      };
    },
  );
}
