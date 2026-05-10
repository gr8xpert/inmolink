import { prisma } from "@inmolink/db";
import { publicPropertySchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/** Opaque cursor over (createdAt, id). Mirrors apps/api dashboard list. */
function encodeCursor(c: { createdAt: Date; id: string }): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep <= 0) return null;
    const ts = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    const d = new Date(ts);
    if (Number.isNaN(d.getTime()) || !id) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}

/**
 * Public marketplace property routes. Anonymous (no `requireUser()`).
 *
 * Hard filters applied at every read:
 *   - `visibility = "PUBLIC"` (PLAN §1 row 5 — only paid PUBLIC tier shows)
 *   - `deletedAt IS NULL`
 *   - `status = "ACTIVE"`  (DRAFT / UNDER_OFFER / SOLD / RENTED / WITHDRAWN don't surface)
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
    "/properties",
    {
      schema: {
        tags: ["public", "properties"],
        summary: "Public property search/list (Postgres-backed; Meilisearch in Sprint 3)",
        querystring: publicPropertySchemas.publicPropertyListQuerySchema,
        response: { 200: publicPropertySchemas.publicPropertyListResponseSchema },
      },
      // Public surface — keep tight even though there's no auth penalty.
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const q = request.query;

      const where: Prisma.PropertyWhereInput = {
        visibility: "PUBLIC",
        status: "ACTIVE",
        deletedAt: null,
        ...(q.transactionType ? { transactionType: q.transactionType } : {}),
        ...(q.propertyTypeId ? { propertyTypeId: q.propertyTypeId } : {}),
        ...(q.locationId ? { locationId: q.locationId } : {}),
        ...(q.bedrooms !== undefined ? { bedrooms: { gte: q.bedrooms } } : {}),
        ...(q.minPriceCents !== undefined || q.maxPriceCents !== undefined
          ? {
              priceCents: {
                ...(q.minPriceCents !== undefined ? { gte: BigInt(q.minPriceCents) } : {}),
                ...(q.maxPriceCents !== undefined ? { lte: BigInt(q.maxPriceCents) } : {}),
              },
            }
          : {}),
        // featureIds: AND — every listed feature must be on the property.
        // Modelled as one `features.some` per id rather than `every` (which
        // would also match properties with NO features when the array is
        // empty — wrong semantics).
        ...(q.featureIds && q.featureIds.length > 0
          ? {
              AND: q.featureIds.map((featureId) => ({
                features: { some: { featureId } },
              })),
            }
          : {}),
        // Free-text — ILIKE on title + description across any locale's
        // translation. Sprint 3 swaps this for Meilisearch with proper
        // tokenisation, language analyzers, and faceting.
        ...(q.q
          ? {
              translations: {
                some: {
                  OR: [
                    { title: { contains: q.q, mode: "insensitive" } },
                    { description: { contains: q.q, mode: "insensitive" } },
                  ],
                },
              },
            }
          : {}),
      };

      // Cursor: rows with (createdAt, id) strictly less than the cursor
      // — same shape as the dashboard list. Avoids OFFSET on hot lists.
      const cursor = q.cursor ? decodeCursor(q.cursor) : null;
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ];
      }

      const rows = await prisma.property.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          transactionType: true,
          priceCents: true,
          currency: true,
          priceType: true,
          bedrooms: true,
          bathrooms: true,
          areaM2: true,
          propertyTypeId: true,
          locationId: true,
          publishedAt: true,
          translations: {
            select: { locale: true, title: true, slug: true },
          },
          agency: { select: { id: true, slug: true, name: true, logoR2Key: true } },
          // Cover first, then earliest-position; the OR-ish logic is
          // expressed as a multi-key orderBy so Prisma can satisfy it
          // with a single query.
          images: {
            select: {
              altText: true,
              isCover: true,
              mediaObject: { select: { r2Key: true } },
            },
            orderBy: [{ isCover: "desc" }, { position: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: q.limit + 1,
      });

      const hasMore = rows.length > q.limit;
      const items = rows.slice(0, q.limit).map((r) => {
        const tr =
          r.translations.find((t) => t.locale === q.locale) ??
          r.translations.find((t) => t.locale === "en") ??
          r.translations[0];
        const cover = r.images[0];
        return {
          id: r.id,
          transactionType: r.transactionType,
          priceCents: Number(r.priceCents),
          currency: r.currency,
          priceType: r.priceType as "fixed" | "poa" | "from",
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
          areaM2: r.areaM2,
          propertyTypeId: r.propertyTypeId,
          locationId: r.locationId,
          publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
          slug: tr?.slug ?? r.id,
          title: tr?.title ?? "(untitled)",
          coverUrl: cover ? storage.publicUrl(cover.mediaObject.r2Key) : null,
          coverAlt: cover?.altText ?? null,
          agency: {
            id: r.agency.id,
            slug: r.agency.slug,
            name: r.agency.name,
            logoUrl: r.agency.logoR2Key ? storage.publicUrl(r.agency.logoR2Key) : null,
          },
        };
      });

      const last = items[items.length - 1];
      const lastRow = rows[items.length - 1];
      const nextCursor =
        hasMore && last && lastRow
          ? encodeCursor({ createdAt: lastRow.createdAt, id: last.id })
          : null;

      return { items, nextCursor };
    },
  );

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
