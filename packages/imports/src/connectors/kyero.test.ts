import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NormalizedListing } from "../connector";
import { parseKyeroStream } from "./kyero";

const SAMPLE_PATH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../samples/feeds/kyero-sample.xml",
);

async function collect(): Promise<NormalizedListing[]> {
  const stream = createReadStream(SAMPLE_PATH);
  const out: NormalizedListing[] = [];
  for await (const listing of parseKyeroStream(stream)) {
    out.push(listing);
  }
  return out;
}

describe("KyeroConnector / parseKyeroStream", () => {
  it("parses every property in the sample feed", async () => {
    const listings = await collect();
    expect(listings.length).toBe(270);
  });

  it("populates required fields on the first listing", async () => {
    const listings = await collect();
    const first = listings[0];
    if (!first) throw new Error("expected at least one listing");
    expect(first.externalRef).toBe("R5368168");
    expect(first.source).toBe("KYERO");
    expect(first.transactionType).toBe("SALE");
    expect(first.priceCents).toBe(55_000_000n); // 550000 EUR → 55_000_000 cents
    expect(first.currency).toBe("EUR");
    expect(first.typeName).toBe("Townhouse");
    expect(first.townName).toBe("Cómpeta");
    expect(first.bedrooms).toBe(3);
    expect(first.bathrooms).toBe(3);
    expect(first.areaM2).toBe(205);
    expect(first.plotM2).toBe(249);
    expect(first.videoUrl).toBe("https://youtu.be/wxrmHzmPZwQ");
  });

  it("strips '(Province)' suffix from <province>", async () => {
    const listings = await collect();
    const malagaListings = listings.filter((l) => l.provinceName === "Málaga");
    expect(malagaListings.length).toBeGreaterThan(0);
    // No listing should retain the bracketed suffix.
    expect(listings.every((l) => !/\(\s*Province\s*\)/i.test(l.provinceName ?? ""))).toBe(true);
  });

  it("captures locale-keyed title + description", async () => {
    const listings = await collect();
    const first = listings[0];
    if (!first) throw new Error("expected at least one listing");
    expect(first.translations.en?.title).toBe("Townhouse for sale in Cómpeta");
    expect(first.translations.en?.description).toMatch(/Stunning Renovated Townhouse/);
  });

  it("flattens features with canonical EN name + per-locale map", async () => {
    const listings = await collect();
    const first = listings[0];
    if (!first) throw new Error("expected at least one listing");
    const seaView = first.features.find((f) => f.canonical === "Sea");
    expect(seaView).toBeDefined();
    expect(seaView?.perLocale.en).toBe("Sea");
    // Kyero sample is EN-only — no es/de/fr expected.
    expect(seaView?.perLocale.es).toBeUndefined();
    expect(first.features.some((f) => f.canonical === "Air Conditioning")).toBe(true);
  });

  it("collects all image urls (cache-buster preserved — worker hashes bytes)", async () => {
    const listings = await collect();
    const first = listings[0];
    if (!first) throw new Error("expected at least one listing");
    expect(first.imageUrls.length).toBeGreaterThanOrEqual(14);
    expect(first.imageUrls[0]).toMatch(/^https:\/\/cdn\.resales-online\.com\//);
    expect(first.imageUrls[0]).toContain("?v=");
  });

  it("totals image URLs across whole feed (~33/property avg)", async () => {
    const listings = await collect();
    const total = listings.reduce((acc, l) => acc + l.imageUrls.length, 0);
    // Sample feed has 8,962 image URLs per samples/feeds/README.md.
    expect(total).toBe(8962);
  });

  it("parses sourceUpdatedAt from <date>", async () => {
    const listings = await collect();
    const first = listings[0];
    if (!first) throw new Error("expected at least one listing");
    expect(first.sourceUpdatedAt).toBeInstanceOf(Date);
    expect(first.sourceUpdatedAt?.toISOString()).toBe("2026-05-08T07:41:54.000Z");
  });

  it("derives transactionType from price_freq", async () => {
    const listings = await collect();
    // Sample is all `sale`; assert that to lock the mapping.
    expect(listings.every((l) => l.transactionType === "SALE")).toBe(true);
  });

  it("handles multiple property types in the sample", async () => {
    const listings = await collect();
    const types = new Set(listings.map((l) => l.typeName));
    // README documents 14 distinct types in the sample.
    expect(types.size).toBe(14);
    expect(types.has("Villa")).toBe(true);
    expect(types.has("Townhouse")).toBe(true);
  });
});
