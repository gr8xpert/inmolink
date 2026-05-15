import { prisma } from "@inmolink/db";
import { renderPdf } from "@inmolink/pdf";
import { exportSchemas } from "@inmolink/shared";
import type { Storage } from "@inmolink/storage";
import type { Prisma } from "@prisma/client";
import type { Job, Processor } from "bullmq";
import type pino from "pino";
import { PORTFOLIO_TEMPLATE, PROPERTY_BROCHURE_TEMPLATE, labelsForLocale } from "./templates";

/**
 * EXPORT_GENERATE processor (PLAN §11.11).
 *
 * One job = one Export. Pipeline:
 *   1. Load Export + agency + caller.
 *   2. Resolve target property set (explicit propertyIds OR filters →
 *      agency-scoped query that respects deletedAt + agencyId).
 *   3. Render CSV (RFC 4180) or PDF (Handlebars + Puppeteer via
 *      @inmolink/pdf).
 *   4. Upload to R2 at `exports/<agencyId>/<exportId>.<ext>`.
 *   5. Mark Export.status = SUCCESS + resultR2Key + resultBytes.
 *   6. Failure path: mark FAILED with errorMessage.
 *
 * Concurrency: shared with marketing/imports queues; CONCURRENCY_EMAILS
 * is the wrong knob — we keep at default 2 since Puppeteer is RAM-hungry.
 */

type Args = {
  storage: Storage;
  logger: pino.Logger;
};

type Filters = {
  status?: string;
  visibility?: string;
  transactionType?: string;
  propertyTypeId?: string;
  locationId?: string;
  q?: string;
  bedrooms?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
};

export function makeExportGenerateProcessor(opts: Args): Processor {
  return async function exportGenerateProcessor(job: Job): Promise<void> {
    const { exportId } = exportSchemas.exportGenerateJobSchema.parse(job.data);
    const exportRow = await prisma.export.findUnique({ where: { id: exportId } });
    if (!exportRow) {
      opts.logger.warn({ exportId }, "EXPORT_GENERATE: row not found");
      return;
    }
    if (exportRow.status !== "QUEUED") {
      opts.logger.info(
        { exportId, status: exportRow.status },
        "EXPORT_GENERATE: skipping non-queued",
      );
      return;
    }

    await prisma.export.update({
      where: { id: exportId },
      data: { status: "RUNNING" },
    });

    try {
      const properties = await loadProperties(exportRow);
      const head = properties[0];
      if (!head) {
        throw new Error("Export matched zero properties");
      }
      const agencyName = head.agency.name;
      const ext = exportRow.kind === "CSV" ? "csv" : "pdf";
      const r2Key = `exports/${exportRow.agencyId}/${exportRow.id}.${ext}`;
      let bytes = 0;
      let contentType = "";

      if (exportRow.kind === "CSV") {
        const csv = renderCsv(properties, exportRow.locale);
        const buf = Buffer.from(csv, "utf8");
        bytes = buf.length;
        contentType = "text/csv; charset=utf-8";
        await opts.storage.put(r2Key, buf, contentType);
      } else if (exportRow.kind === "PDF_PROPERTY") {
        const buf = await renderPdf({
          template: PROPERTY_BROCHURE_TEMPLATE,
          data: {
            locale: exportRow.locale,
            labels: labelsForLocale(exportRow.locale),
            agency: { name: agencyName },
            property: buildPropertyData(head, exportRow.locale, opts.storage),
            generatedAt: new Date().toISOString().slice(0, 10),
          },
        });
        bytes = buf.length;
        contentType = "application/pdf";
        await opts.storage.put(r2Key, buf, contentType);
      } else {
        const buf = await renderPdf({
          template: PORTFOLIO_TEMPLATE,
          data: {
            locale: exportRow.locale,
            labels: labelsForLocale(exportRow.locale),
            agency: { name: agencyName },
            properties: properties.map((p) => buildPropertyData(p, exportRow.locale, opts.storage)),
            generatedAt: new Date().toISOString().slice(0, 10),
          },
        });
        bytes = buf.length;
        contentType = "application/pdf";
        await opts.storage.put(r2Key, buf, contentType);
      }

      await prisma.export.update({
        where: { id: exportId },
        data: {
          status: "SUCCESS",
          resultR2Key: r2Key,
          resultBytes: bytes,
          finishedAt: new Date(),
        },
      });
      opts.logger.info({ exportId, r2Key, bytes, contentType }, "Export generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "export failed";
      opts.logger.error({ err: message, exportId }, "Export generation failed");
      await prisma.export.update({
        where: { id: exportId },
        data: {
          status: "FAILED",
          errorMessage: message.slice(0, 500),
          finishedAt: new Date(),
        },
      });
    }
  };
}

// ---- Load + project ----

async function loadProperties(exportRow: {
  agencyId: string;
  locale: string;
  filters: Prisma.JsonValue;
  propertyIds: Prisma.JsonValue;
}) {
  const where: Prisma.PropertyWhereInput = {
    ownerAgencyId: exportRow.agencyId,
    deletedAt: null,
  };

  if (Array.isArray(exportRow.propertyIds) && exportRow.propertyIds.length > 0) {
    where.id = { in: exportRow.propertyIds as string[] };
  } else if (exportRow.filters && typeof exportRow.filters === "object") {
    const f = exportRow.filters as Filters;
    if (f.status) where.status = f.status as Prisma.PropertyWhereInput["status"];
    if (f.visibility) {
      where.visibility = f.visibility as Prisma.PropertyWhereInput["visibility"];
    }
    if (f.transactionType) {
      where.transactionType = f.transactionType as Prisma.PropertyWhereInput["transactionType"];
    }
    if (f.propertyTypeId) where.propertyTypeId = f.propertyTypeId;
    if (f.locationId) where.locationId = f.locationId;
    if (f.bedrooms !== undefined) where.bedrooms = { gte: f.bedrooms };
    if (f.minPriceCents !== undefined || f.maxPriceCents !== undefined) {
      const range: Prisma.BigIntFilter<"Property"> = {};
      if (f.minPriceCents !== undefined) range.gte = BigInt(f.minPriceCents);
      if (f.maxPriceCents !== undefined) range.lte = BigInt(f.maxPriceCents);
      where.priceCents = range;
    }
    if (f.q) {
      where.translations = {
        some: { OR: [{ title: { contains: f.q, mode: "insensitive" } }] },
      };
    }
  }

  return prisma.property.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
    include: {
      translations: true,
      features: { include: { feature: { include: { translations: true } } } },
      images: {
        where: { isCover: true },
        include: { mediaObject: { select: { hash: true, r2Key: true } } },
        take: 1,
      },
      location: { include: { translations: true } },
      agency: { select: { name: true } },
    },
  });
}

type LoadedProperty = Awaited<ReturnType<typeof loadProperties>>[number];

function pickTranslation<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((t) => t.locale === locale) ?? rows.find((t) => t.locale === "en") ?? rows[0];
}

function formatPrice(priceCents: bigint, currency: string, locale: string): string {
  const value = Number(priceCents) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en")}`;
  }
}

function buildPropertyData(p: LoadedProperty, locale: string, storage: Storage) {
  const tx = pickTranslation(p.translations, locale);
  const loc = p.location ? pickTranslation(p.location.translations, locale) : null;
  const cover = p.images[0]?.mediaObject;
  const coverImage = cover ? storage.publicUrl(cover.r2Key) : null;
  const features: string[] = p.features
    .map((pf) => pickTranslation(pf.feature.translations, locale)?.name ?? "")
    .filter(Boolean);
  return {
    title: tx?.title ?? "Untitled",
    description: tx?.description ?? "",
    location: loc?.name ?? "",
    transactionType: p.transactionType,
    priceFormatted: formatPrice(p.priceCents, p.currency, locale),
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    areaM2: p.areaM2,
    plotM2: p.plotM2,
    coverImage,
    features,
  };
}

// ---- CSV ----

const CSV_COLUMNS = [
  "id",
  "title",
  "status",
  "visibility",
  "transactionType",
  "priceCents",
  "currency",
  "bedrooms",
  "bathrooms",
  "areaM2",
  "plotM2",
  "yearBuilt",
  "propertyType",
  "location",
  "createdAt",
  "publishedAt",
] as const;

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderCsv(properties: LoadedProperty[], locale: string): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(","));
  for (const p of properties) {
    const tx = pickTranslation(p.translations, locale);
    const loc = p.location ? pickTranslation(p.location.translations, locale) : null;
    lines.push(
      [
        p.id,
        tx?.title ?? "",
        p.status,
        p.visibility,
        p.transactionType,
        p.priceCents.toString(),
        p.currency,
        p.bedrooms ?? "",
        p.bathrooms ?? "",
        p.areaM2 ?? "",
        p.plotM2 ?? "",
        p.yearBuilt ?? "",
        p.propertyTypeId ?? "",
        loc?.name ?? "",
        p.createdAt.toISOString(),
        p.publishedAt?.toISOString() ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
