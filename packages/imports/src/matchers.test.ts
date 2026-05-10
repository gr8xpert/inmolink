import { describe, expect, it, vi } from "vitest";

// The matchers module imports `prisma` from `@inmolink/db` — mock that
// before the SUT loads so we don't need a live database.
vi.mock("@inmolink/db", () => ({
  prisma: {
    feedTypeMap: { findUnique: vi.fn() },
    propertyTypeTranslation: { findFirst: vi.fn() },
    locationTranslation: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    featureTranslation: { findMany: vi.fn() },
  },
}));

const { prisma } = await import("@inmolink/db");
const { findPropertyTypeForFeed, findLocationForTown, findFeatureIdsByName } = await import(
  "./matchers"
);

const mockedPrisma = prisma as unknown as {
  feedTypeMap: { findUnique: ReturnType<typeof vi.fn> };
  propertyTypeTranslation: { findFirst: ReturnType<typeof vi.fn> };
  locationTranslation: { findMany: ReturnType<typeof vi.fn> };
  location: { findMany: ReturnType<typeof vi.fn> };
  featureTranslation: { findMany: ReturnType<typeof vi.fn> };
};

describe("findPropertyTypeForFeed", () => {
  it("returns the curated mapping when present", async () => {
    mockedPrisma.feedTypeMap.findUnique.mockResolvedValue({
      propertyTypeId: "pt_123",
    });
    const r = await findPropertyTypeForFeed({ kind: "KYERO", sourceLabel: "Townhouse" });
    expect(r).toEqual({ matched: true, propertyTypeId: "pt_123", via: "feed-type-map" });
    expect(mockedPrisma.feedTypeMap.findUnique).toHaveBeenCalledWith({
      where: { kind_sourceLabel: { kind: "KYERO", sourceLabel: "townhouse" } },
    });
  });

  it("falls back to translation match when no curated mapping", async () => {
    mockedPrisma.feedTypeMap.findUnique.mockResolvedValue(null);
    mockedPrisma.propertyTypeTranslation.findFirst.mockResolvedValue({ typeId: "pt_456" });
    const r = await findPropertyTypeForFeed({ kind: "KYERO", sourceLabel: "Villa" });
    expect(r).toEqual({ matched: true, propertyTypeId: "pt_456", via: "translation" });
  });

  it("returns matched: false when nothing matches", async () => {
    mockedPrisma.feedTypeMap.findUnique.mockResolvedValue(null);
    mockedPrisma.propertyTypeTranslation.findFirst.mockResolvedValue(null);
    const r = await findPropertyTypeForFeed({ kind: "KYERO", sourceLabel: "Cave House" });
    expect(r).toEqual({ matched: false });
  });

  it("rejects empty source labels without hitting the DB", async () => {
    mockedPrisma.feedTypeMap.findUnique.mockClear();
    const r = await findPropertyTypeForFeed({ kind: "KYERO", sourceLabel: "   " });
    expect(r).toEqual({ matched: false });
    expect(mockedPrisma.feedTypeMap.findUnique).not.toHaveBeenCalled();
  });
});

describe("findLocationForTown", () => {
  it("returns the unique match when only one candidate exists", async () => {
    mockedPrisma.locationTranslation.findMany.mockResolvedValue([
      { locationId: "loc_1", location: { id: "loc_1", parentId: "p_1", countryCode: "ES" } },
    ]);
    const r = await findLocationForTown({ townName: "Marbella", countryCode: "ES" });
    expect(r).toEqual({ matched: true, locationId: "loc_1", ambiguous: false });
  });

  it("uses province as tie-breaker when multiple candidates", async () => {
    mockedPrisma.locationTranslation.findMany.mockResolvedValue([
      {
        locationId: "loc_a",
        location: { id: "loc_a", parentId: "prov_argentina", countryCode: "ES" },
      },
      {
        locationId: "loc_b",
        location: { id: "loc_b", parentId: "prov_andalucia", countryCode: "ES" },
      },
    ]);
    mockedPrisma.location.findMany.mockResolvedValue([
      { id: "prov_argentina", translations: [{ name: "Argentina" }] },
      { id: "prov_andalucia", translations: [{ name: "Málaga" }] },
    ]);
    const r = await findLocationForTown({
      townName: "Córdoba",
      provinceName: "Málaga",
      countryCode: "ES",
    });
    expect(r).toEqual({ matched: true, locationId: "loc_b", ambiguous: false });
  });

  it("flags ambiguous when multiple match without a tie-breaker", async () => {
    mockedPrisma.locationTranslation.findMany.mockResolvedValue([
      { locationId: "loc_a", location: { id: "loc_a", parentId: "p_1", countryCode: "ES" } },
      { locationId: "loc_b", location: { id: "loc_b", parentId: "p_2", countryCode: "ES" } },
    ]);
    const r = await findLocationForTown({ townName: "Córdoba", countryCode: "ES" });
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.ambiguous).toBe(true);
  });

  it("returns matched: false on no candidates", async () => {
    mockedPrisma.locationTranslation.findMany.mockResolvedValue([]);
    const r = await findLocationForTown({ townName: "Atlantis", countryCode: "ES" });
    expect(r).toEqual({ matched: false });
  });
});

describe("findFeatureIdsByName", () => {
  it("dedupes feature ids and surfaces unmatched names", async () => {
    mockedPrisma.featureTranslation.findMany.mockResolvedValue([
      { featureId: "f_pool", name: "Pool" },
      { featureId: "f_pool", name: "Piscina" }, // same feature, two locales
      { featureId: "f_garage", name: "Garage" },
    ]);
    const r = await findFeatureIdsByName(["Pool", "Garage", "Helipad"]);
    expect(r.matchedFeatureIds.sort()).toEqual(["f_garage", "f_pool"]);
    expect(r.unmatchedNames).toEqual(["Helipad"]);
  });

  it("returns empty result for empty input without hitting the DB", async () => {
    mockedPrisma.featureTranslation.findMany.mockClear();
    const r = await findFeatureIdsByName([]);
    expect(r).toEqual({ matchedFeatureIds: [], unmatchedNames: [] });
    expect(mockedPrisma.featureTranslation.findMany).not.toHaveBeenCalled();
  });
});
