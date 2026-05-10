import { prisma } from "@inmolink/db";
import { publicLocationSchemas } from "@inmolink/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/**
 * Public location-landing routes (PLAN §11.13). Anonymous read; ISR cached
 * by apps/public for ~10min.
 *
 * Resolution rules:
 *   - URL `/[locale]/buy/<country>/<region?>/<city?>/<area?>` →
 *     api `?path=country/region/city/area&locale=en`. We resolve each
 *     segment via (locale, slug) — the unique constraint on
 *     LocationTranslation makes that lookup point-in-time deterministic.
 *   - We then verify the parent chain (level + parentId) so a hand-crafted
 *     URL like `/buy/spain/elviria` (skipping malaga) returns 404 instead
 *     of leaking a wrong-tree result.
 *
 * Property count is **descendant-inclusive** — country page should reflect
 * "10K properties in Spain", not "0 properties at the country row itself".
 * Walks descendants via parent chain in JS (max depth 4 — 5 indexed queries).
 */

const LEVEL_BY_DEPTH = ["COUNTRY", "REGION", "CITY", "AREA"] as const;

async function descendantLocationIds(rootId: string): Promise<string[]> {
  const all = [rootId];
  let frontier: string[] = [rootId];
  // 4 levels: COUNTRY → REGION → CITY → AREA. We walk down regardless of
  // current depth — the loop short-circuits when no children remain.
  for (let i = 0; i < 4; i++) {
    if (frontier.length === 0) break;
    const children = await prisma.location.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    if (children.length === 0) break;
    const nextIds = children.map((c) => c.id);
    all.push(...nextIds);
    frontier = nextIds;
  }
  return all;
}

function pickTranslation<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en") ?? rows[0];
}

export async function publicLocationRoutes(app: FastifyInstance): Promise<void> {
  const fastify = app.withTypeProvider<ZodTypeProvider>();

  fastify.get(
    "/locations/landing",
    {
      schema: {
        tags: ["public", "locations"],
        summary: "Public location-landing data (resolves up to 4-segment slug path)",
        querystring: publicLocationSchemas.publicLocationLandingQuerySchema,
        response: { 200: publicLocationSchemas.publicLocationLandingSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { path, locale } = request.query;
      const segments = path
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length === 0 || segments.length > 4) {
        throw app.httpErrors.notFound("Location not found");
      }

      // Resolve each segment by its slug in this locale. Lookups are
      // O(N segments) sequential — could batch but we cap at 4.
      const resolved: Array<{
        id: string;
        level: (typeof LEVEL_BY_DEPTH)[number];
        parentId: string | null;
        countryCode: string;
        latitude: number | null;
        longitude: number | null;
        translations: {
          locale: string;
          name: string;
          slug: string;
          metaTitle: string | null;
          metaDescription: string | null;
        }[];
      }> = [];
      for (let i = 0; i < segments.length; i++) {
        const segSlug = segments[i] as string;
        const tr = await prisma.locationTranslation.findFirst({
          where: { locale, slug: segSlug },
          select: {
            location: {
              select: {
                id: true,
                level: true,
                parentId: true,
                countryCode: true,
                latitude: true,
                longitude: true,
                translations: {
                  select: {
                    locale: true,
                    name: true,
                    slug: true,
                    metaTitle: true,
                    metaDescription: true,
                  },
                },
              },
            },
          },
        });
        if (!tr?.location) throw app.httpErrors.notFound("Location not found");

        const expectedLevel = LEVEL_BY_DEPTH[i];
        if (tr.location.level !== expectedLevel) {
          throw app.httpErrors.notFound("Location not found");
        }
        if (i > 0) {
          const parent = resolved[i - 1];
          if (!parent || tr.location.parentId !== parent.id) {
            throw app.httpErrors.notFound("Location not found");
          }
        } else if (tr.location.parentId !== null) {
          // Country segment: parent must be null.
          throw app.httpErrors.notFound("Location not found");
        }

        resolved.push({
          id: tr.location.id,
          level: tr.location.level as (typeof LEVEL_BY_DEPTH)[number],
          parentId: tr.location.parentId,
          countryCode: tr.location.countryCode,
          latitude: tr.location.latitude !== null ? Number(tr.location.latitude) : null,
          longitude: tr.location.longitude !== null ? Number(tr.location.longitude) : null,
          translations: tr.location.translations,
        });
      }

      const target = resolved[resolved.length - 1];
      if (!target) throw app.httpErrors.notFound("Location not found");

      // Build breadcrumb (locale-correct slugs).
      const breadcrumb = resolved.map((row, idx) => {
        const t = pickTranslation(row.translations, locale);
        const subPath = `/buy/${segments.slice(0, idx + 1).join("/")}`;
        return {
          level: row.level,
          name: t?.name ?? "(untitled)",
          slug: t?.slug ?? "",
          path: subPath,
        };
      });

      // Children — direct children of target, ordered by their position
      // (admin's curated ordering). Each child needs its locale slug to
      // build the link.
      const childRows = await prisma.location.findMany({
        where: { parentId: target.id },
        select: {
          id: true,
          level: true,
          translations: { select: { locale: true, name: true, slug: true } },
          _count: { select: { properties: true } },
        },
        orderBy: { position: "asc" },
      });

      const children = childRows.map((c) => {
        const t = pickTranslation(c.translations, locale);
        const childPath = `${breadcrumb[breadcrumb.length - 1]?.path ?? "/buy"}/${t?.slug ?? ""}`;
        return {
          id: c.id,
          level: c.level as (typeof LEVEL_BY_DEPTH)[number],
          name: t?.name ?? "(untitled)",
          slug: t?.slug ?? "",
          path: childPath,
          // Direct-properties only here — the descendant rollup can be
          // expensive per child. Page subtitle uses `totalProperties` for
          // the *target* location which IS rolled up.
          propertyCount: c._count.properties,
        };
      });

      const targetTranslation = pickTranslation(target.translations, locale);
      const path0 = `/buy/${segments.join("/")}`;

      // Property total under this entire subtree.
      const descIds = await descendantLocationIds(target.id);
      const totalProperties = await prisma.property.count({
        where: {
          locationId: { in: descIds },
          visibility: "PUBLIC",
          status: "ACTIVE",
          deletedAt: null,
        },
      });

      // FAQs — locale-specific, ordered.
      const faqRows = await prisma.locationFAQ.findMany({
        where: { locationId: target.id, locale },
        orderBy: { position: "asc" },
        select: { question: true, answer: true },
      });

      return {
        id: target.id,
        level: target.level,
        countryCode: target.countryCode,
        name: targetTranslation?.name ?? "(untitled)",
        slug: targetTranslation?.slug ?? "",
        metaTitle: targetTranslation?.metaTitle ?? null,
        metaDescription: targetTranslation?.metaDescription ?? null,
        path: path0,
        latitude: target.latitude,
        longitude: target.longitude,
        breadcrumb,
        children,
        faqs: faqRows,
        totalProperties,
      };
    },
  );

  fastify.get(
    "/location-groups/landing",
    {
      schema: {
        tags: ["public", "locations"],
        summary: "Public LocationGroup landing (resolves group slug in locale)",
        querystring: publicLocationSchemas.publicLocationGroupLandingQuerySchema,
        response: { 200: publicLocationSchemas.publicLocationGroupLandingSchema },
      },
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { slug, locale } = request.query;

      const tr = await prisma.locationGroupTranslation.findFirst({
        where: { locale, slug },
        select: {
          group: {
            select: {
              id: true,
              translations: {
                select: {
                  locale: true,
                  name: true,
                  slug: true,
                  metaTitle: true,
                  metaDescription: true,
                },
              },
              members: {
                select: {
                  position: true,
                  location: {
                    select: {
                      id: true,
                      level: true,
                      parentId: true,
                      translations: { select: { locale: true, name: true, slug: true } },
                      _count: { select: { properties: true } },
                    },
                  },
                },
                orderBy: { position: "asc" },
              },
            },
          },
        },
      });
      if (!tr?.group) throw app.httpErrors.notFound("LocationGroup not found");

      const groupTranslation = pickTranslation(tr.group.translations, locale);

      // For each member, build its canonical path. We need the ancestor
      // chain to render `/buy/<country>/<region>/<city>/<area>` correctly.
      // Walk parents in JS (depth ≤ 4) — same approach as descendantLocationIds.
      const memberPromises = tr.group.members.map(async (m) => {
        const memberT = pickTranslation(m.location.translations, locale);

        // Walk up to root — collect slugs in reverse order.
        const slugChain: string[] = [];
        let cursor: string | null = m.location.id;
        for (let i = 0; i < 4; i++) {
          if (!cursor) break;
          const row: { parentId: string | null; translations: { slug: string }[] } | null =
            await prisma.location.findUnique({
              where: { id: cursor },
              select: {
                parentId: true,
                translations: { where: { locale }, select: { slug: true } },
              },
            });
          if (!row) break;
          const seg = row.translations[0]?.slug;
          if (!seg) break;
          slugChain.unshift(seg);
          cursor = row.parentId;
        }
        const memberPath =
          slugChain.length > 0 ? `/buy/${slugChain.join("/")}` : `/buy/${memberT?.slug ?? ""}`;

        return {
          id: m.location.id,
          level: m.location.level as (typeof LEVEL_BY_DEPTH)[number],
          name: memberT?.name ?? "(untitled)",
          slug: memberT?.slug ?? "",
          path: memberPath,
          propertyCount: m.location._count.properties,
        };
      });
      const members = await Promise.all(memberPromises);

      // Total properties across all member subtrees. Concat descendant
      // sets, dedupe, then count once.
      const descSets = await Promise.all(members.map((m) => descendantLocationIds(m.id)));
      const allIds = Array.from(new Set(descSets.flat()));
      const totalProperties =
        allIds.length > 0
          ? await prisma.property.count({
              where: {
                locationId: { in: allIds },
                visibility: "PUBLIC",
                status: "ACTIVE",
                deletedAt: null,
              },
            })
          : 0;

      return {
        id: tr.group.id,
        name: groupTranslation?.name ?? "(unnamed)",
        slug: groupTranslation?.slug ?? slug,
        metaTitle: groupTranslation?.metaTitle ?? null,
        metaDescription: groupTranslation?.metaDescription ?? null,
        members,
        totalProperties,
      };
    },
  );
}
