import { prisma } from "@inmolink/db";
import { taxonomySchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Read-only taxonomy endpoints. Anonymous (no `requireUser()`) so the
 * public marketplace search page can populate its filter pickers
 * without signing in. Sprint 2 ships full CRUD under super-admin (write
 * side will require auth + role check).
 *
 * Localized name selection: requested locale → en → first available.
 * Done in JS rather than SQL so we don't need a function or distinct CTE.
 */

const localeQuery = z.object({
  locale: z.enum(["en", "es", "de", "fr"]).default("en"),
});

function pickName(
  translations: Array<{ locale: string; name: string }>,
  requested: string,
): string {
  return (
    translations.find((t) => t.locale === requested)?.name ??
    translations.find((t) => t.locale === "en")?.name ??
    translations[0]?.name ??
    "(unnamed)"
  );
}

export async function taxonomyRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/property-types",
    {
      schema: {
        tags: ["taxonomy"],
        summary: "List active PropertyTypes (for dashboard pickers)",
        querystring: localeQuery,
        response: { 200: taxonomySchemas.propertyTypeListResponseSchema },
      },
    },
    async (request) => {
      const { locale } = request.query;
      const rows = await prisma.propertyType.findMany({
        where: { isActive: true },
        select: {
          id: true,
          groupId: true,
          iconName: true,
          position: true,
          translations: { select: { locale: true, name: true } },
        },
        orderBy: [{ groupId: "asc" }, { position: "asc" }],
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          groupId: r.groupId,
          name: pickName(r.translations, locale),
          iconName: r.iconName,
          position: r.position,
        })),
      };
    },
  );

  fastify.get(
    "/locations",
    {
      schema: {
        tags: ["taxonomy"],
        summary: "List active Locations (flat — for dashboard pickers)",
        querystring: localeQuery,
        response: { 200: taxonomySchemas.locationListResponseSchema },
      },
    },
    async (request) => {
      const { locale } = request.query;
      const rows = await prisma.location.findMany({
        where: { isActive: true },
        select: {
          id: true,
          parentId: true,
          level: true,
          countryCode: true,
          position: true,
          translations: { select: { locale: true, name: true } },
        },
        orderBy: [{ countryCode: "asc" }, { level: "asc" }, { position: "asc" }],
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          parentId: r.parentId,
          level: r.level,
          countryCode: r.countryCode,
          name: pickName(r.translations, locale),
          position: r.position,
        })),
      };
    },
  );
}
