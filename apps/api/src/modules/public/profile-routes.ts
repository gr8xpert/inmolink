import { prisma } from "@inmolink/db";
import { publicProfileSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Public profile pages (PLAN §8).
 *
 *  - /api/public/agencies/:slug         — agency landing payload
 *  - /api/public/agencies/:slug/properties — paginated agency listings
 *  - /api/public/agents/:slug           — agent landing payload
 *  - /api/public/agents/:slug/properties — paginated agent listings
 *
 * Both landings include their first 12 cards inline so the page renders
 * without a second round-trip; "see more" pagination uses the dedicated
 * /properties endpoint with (createdAt, id) cursor — same shape as the
 * existing public properties list.
 */

const slugParam = z.object({ slug: z.string().min(1).max(80) });

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

const cardSelect = {
  id: true,
  createdAt: true,
  transactionType: true,
  priceCents: true,
  currency: true,
  priceType: true,
  bedrooms: true,
  bathrooms: true,
  areaM2: true,
  publishedAt: true,
  translations: { select: { locale: true, title: true, slug: true } },
  images: {
    select: {
      altText: true,
      isCover: true,
      mediaObject: { select: { r2Key: true } },
    },
    orderBy: [{ isCover: "desc" }, { position: "asc" }, { createdAt: "asc" }] as const,
    take: 1,
  },
} satisfies Prisma.PropertySelect;

type CardRow = Prisma.PropertyGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CardRow, locale: string, storage: Storage): publicProfileSchemas.PropertyCard {
  const tr =
    row.translations.find((t) => t.locale === locale) ??
    row.translations.find((t) => t.locale === "en") ??
    row.translations[0];
  const cover = row.images[0];
  return {
    id: row.id,
    slug: tr?.slug ?? row.id,
    title: tr?.title ?? "(untitled)",
    transactionType: row.transactionType,
    priceCents: Number(row.priceCents),
    currency: row.currency,
    priceType: row.priceType as "fixed" | "poa" | "from",
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaM2: row.areaM2,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    coverUrl: cover ? storage.publicUrl(cover.mediaObject.r2Key) : null,
    coverAlt: cover?.altText ?? null,
  };
}

const PUBLIC_PROPERTY_FILTER: Prisma.PropertyWhereInput = {
  status: "ACTIVE",
  visibility: "PUBLIC",
  deletedAt: null,
};

export async function publicProfileRoutes(
  app: FastifyInstance,
  opts: { storage: Storage },
): Promise<void> {
  const { storage } = opts;
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  // ---------- Agency ----------

  fastify.get(
    "/agencies/:slug",
    {
      schema: {
        tags: ["public", "profiles"],
        summary: "Public agency profile (anonymous)",
        params: slugParam,
        querystring: z.object({ locale: z.enum(["en", "es", "de", "fr"]).default("en") }),
        response: { 200: publicProfileSchemas.publicAgencyDetailSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { slug } = request.params;
      const { locale } = request.query;

      const agency = await prisma.agency.findFirst({
        where: { slug, isPublic: true, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          countryCode: true,
          email: true,
          phone: true,
          website: true,
          whatsappNumber: true,
          socialFacebook: true,
          socialInstagram: true,
          socialLinkedin: true,
          socialTwitter: true,
          logoR2Key: true,
          bannerR2Key: true,
          heroImageR2Key: true,
          translations: {
            select: { locale: true, description: true, metaTitle: true, metaDescription: true },
          },
          members: {
            where: { isActive: true, publicProfileEnabled: true },
            select: {
              slug: true,
              firstName: true,
              lastName: true,
              role: true,
              bio: true,
              languagesSpoken: true,
              photoR2Key: true,
            },
            orderBy: [{ role: "asc" }, { firstName: "asc" }],
            take: 30,
          },
        },
      });
      if (!agency) throw app.httpErrors.notFound("Agency not found");

      const tr =
        agency.translations.find((t) => t.locale === locale) ??
        agency.translations.find((t) => t.locale === "en") ??
        agency.translations[0] ??
        null;

      const baseFilter: Prisma.PropertyWhereInput = {
        ...PUBLIC_PROPERTY_FILTER,
        ownerAgencyId: agency.id,
      };

      const [totalProperties, propertyRows] = await Promise.all([
        prisma.property.count({ where: baseFilter }),
        prisma.property.findMany({
          where: baseFilter,
          select: cardSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
        }),
      ]);

      const detail: publicProfileSchemas.PublicAgencyDetail = {
        id: agency.id,
        slug: agency.slug,
        name: agency.name,
        countryCode: agency.countryCode,
        email: agency.email,
        phone: agency.phone,
        website: agency.website,
        whatsappNumber: agency.whatsappNumber,
        socialFacebook: agency.socialFacebook,
        socialInstagram: agency.socialInstagram,
        socialLinkedin: agency.socialLinkedin,
        socialTwitter: agency.socialTwitter,
        logoPublicUrl: agency.logoR2Key ? storage.publicUrl(agency.logoR2Key) : null,
        bannerPublicUrl: agency.bannerR2Key ? storage.publicUrl(agency.bannerR2Key) : null,
        heroImagePublicUrl: agency.heroImageR2Key ? storage.publicUrl(agency.heroImageR2Key) : null,
        translation: {
          locale: (tr?.locale ?? locale) as "en" | "es" | "de" | "fr",
          description: tr?.description ?? null,
          metaTitle: tr?.metaTitle ?? null,
          metaDescription: tr?.metaDescription ?? null,
        },
        members: agency.members.map((m) => ({
          slug: m.slug,
          firstName: m.firstName,
          lastName: m.lastName,
          role: m.role,
          bio: m.bio,
          languagesSpoken: m.languagesSpoken,
          photoPublicUrl: m.photoR2Key ? storage.publicUrl(m.photoR2Key) : null,
        })),
        totalProperties,
        properties: propertyRows.map((r) => toCard(r, locale, storage)),
      };
      return detail;
    },
  );

  fastify.get(
    "/agencies/:slug/properties",
    {
      schema: {
        tags: ["public", "profiles"],
        summary: "Paginated public agency listings",
        params: slugParam,
        querystring: publicProfileSchemas.publicProfileListQuerySchema,
        response: { 200: publicProfileSchemas.publicProfileListResponseSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { slug } = request.params;
      const { locale, cursor, limit } = request.query;

      const agency = await prisma.agency.findFirst({
        where: { slug, isPublic: true, isActive: true },
        select: { id: true },
      });
      if (!agency) throw app.httpErrors.notFound("Agency not found");

      const where: Prisma.PropertyWhereInput = {
        ...PUBLIC_PROPERTY_FILTER,
        ownerAgencyId: agency.id,
      };
      const decoded = cursor ? decodeCursor(cursor) : null;
      if (decoded) {
        where.OR = [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ];
      }
      const rows = await prisma.property.findMany({
        where,
        select: cardSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;
      const last = slice[slice.length - 1];
      return {
        items: slice.map((r) => toCard(r, locale, storage)),
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    },
  );

  // ---------- Agent ----------

  fastify.get(
    "/agents/:slug",
    {
      schema: {
        tags: ["public", "profiles"],
        summary: "Public agent profile (anonymous)",
        params: slugParam,
        querystring: z.object({ locale: z.enum(["en", "es", "de", "fr"]).default("en") }),
        response: { 200: publicProfileSchemas.publicAgentDetailSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { slug } = request.params;
      const { locale } = request.query;

      const user = await prisma.user.findFirst({
        where: {
          slug,
          isActive: true,
          publicProfileEnabled: true,
          // Agent profile only visible if agency is also public + active.
          agency: { isPublic: true, isActive: true },
        },
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          role: true,
          bio: true,
          languagesSpoken: true,
          photoR2Key: true,
          phone: true,
          whatsappNumber: true,
          agencyId: true,
          agency: { select: { id: true, slug: true, name: true, logoR2Key: true } },
        },
      });
      if (!user || !user.agency) throw app.httpErrors.notFound("Agent not found");

      const baseFilter: Prisma.PropertyWhereInput = {
        ...PUBLIC_PROPERTY_FILTER,
        ownerUserId: user.id,
      };

      const [totalProperties, propertyRows] = await Promise.all([
        prisma.property.count({ where: baseFilter }),
        prisma.property.findMany({
          where: baseFilter,
          select: cardSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
        }),
      ]);

      const detail: publicProfileSchemas.PublicAgentDetail = {
        slug: user.slug,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        bio: user.bio,
        languagesSpoken: user.languagesSpoken,
        photoPublicUrl: user.photoR2Key ? storage.publicUrl(user.photoR2Key) : null,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        agency: {
          id: user.agency.id,
          slug: user.agency.slug,
          name: user.agency.name,
          logoPublicUrl: user.agency.logoR2Key ? storage.publicUrl(user.agency.logoR2Key) : null,
        },
        totalProperties,
        properties: propertyRows.map((r) => toCard(r, locale, storage)),
      };
      return detail;
    },
  );

  fastify.get(
    "/agents/:slug/properties",
    {
      schema: {
        tags: ["public", "profiles"],
        summary: "Paginated public agent listings",
        params: slugParam,
        querystring: publicProfileSchemas.publicProfileListQuerySchema,
        response: { 200: publicProfileSchemas.publicProfileListResponseSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { slug } = request.params;
      const { locale, cursor, limit } = request.query;

      const user = await prisma.user.findFirst({
        where: {
          slug,
          isActive: true,
          publicProfileEnabled: true,
          agency: { isPublic: true, isActive: true },
        },
        select: { id: true },
      });
      if (!user) throw app.httpErrors.notFound("Agent not found");

      const where: Prisma.PropertyWhereInput = {
        ...PUBLIC_PROPERTY_FILTER,
        ownerUserId: user.id,
      };
      const decoded = cursor ? decodeCursor(cursor) : null;
      if (decoded) {
        where.OR = [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ];
      }
      const rows = await prisma.property.findMany({
        where,
        select: cardSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;
      const last = slice[slice.length - 1];
      return {
        items: slice.map((r) => toCard(r, locale, storage)),
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    },
  );
}
