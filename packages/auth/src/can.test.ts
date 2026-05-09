import { describe, expect, it } from "vitest";
import { type Subject, can } from "./can";

const make = (overrides: Partial<Subject> = {}): Subject => ({
  role: "AGENT",
  agencyId: "agency-1",
  planTier: "FREE",
  ...overrides,
});

describe("can() — SUPER_ADMIN bypass", () => {
  const su: Subject = make({ role: "SUPER_ADMIN", planTier: "FREE" });

  it("can do any feature even on FREE", () => {
    expect(can(su, "feature:export.csv")).toBe(true);
    expect(can(su, "feature:visibility.public")).toBe(true);
  });

  it("can write any resource regardless of agency", () => {
    expect(can(su, "resource:property:update", { ownerAgencyId: "other", ownerUserId: "x" })).toBe(
      true,
    );
    expect(can(su, "resource:property:delete")).toBe(true);
  });

  it("can read", () => {
    expect(can(su, "resource:property:read")).toBe(true);
  });
});

describe("can() — paid feature gate", () => {
  it("denies feature:* on FREE for non-super-admin", () => {
    expect(can(make({ role: "AGENT", planTier: "FREE" }), "feature:export.csv")).toBe(false);
    expect(can(make({ role: "AGENCY_ADMIN", planTier: "FREE" }), "feature:visibility.public")).toBe(
      false,
    );
  });

  it("allows feature:* on PRO / BUSINESS / ENTERPRISE", () => {
    for (const tier of ["PRO", "BUSINESS", "ENTERPRISE"] as const) {
      expect(can(make({ planTier: tier }), "feature:export.csv")).toBe(true);
    }
  });
});

describe("can() — AGENCY_ADMIN resource scope", () => {
  const admin = make({ role: "AGENCY_ADMIN", agencyId: "agency-1" });

  it("can write resources owned by their agency", () => {
    expect(can(admin, "resource:property:update", { ownerAgencyId: "agency-1" })).toBe(true);
    expect(can(admin, "resource:property:delete", { ownerAgencyId: "agency-1" })).toBe(true);
    expect(can(admin, "resource:property:create", { ownerAgencyId: "agency-1" })).toBe(true);
  });

  it("cannot write resources owned by another agency", () => {
    expect(can(admin, "resource:property:update", { ownerAgencyId: "agency-2" })).toBe(false);
  });

  it("cannot write when ownerAgencyId is missing (fail closed)", () => {
    expect(can(admin, "resource:property:update", {})).toBe(false);
    expect(can(admin, "resource:property:update")).toBe(false);
  });

  it("can read regardless of agency (visibility filter handles row-level)", () => {
    expect(can(admin, "resource:property:read", { ownerAgencyId: "agency-2" })).toBe(true);
  });
});

describe("can() — AGENT", () => {
  const agent = make({ role: "AGENT", agencyId: "agency-1" });

  it("can read (visibility filter at query layer enforces row-level)", () => {
    expect(can(agent, "resource:property:read")).toBe(true);
  });

  it("cannot write through can() — caller does the userId match itself", () => {
    // Documents current behaviour: can() never returns true for AGENT writes
    // because it has no `userId` on Subject. Per route ownershipMatches the
    // caller compares `viewer.userId === resource.ownerUserId` separately.
    expect(can(agent, "resource:property:update", { ownerUserId: agent.agencyId ?? "" })).toBe(
      false,
    );
    expect(can(agent, "resource:property:create")).toBe(false);
    expect(can(agent, "resource:property:delete")).toBe(false);
  });
});

describe("can() — unknown action shape", () => {
  it("denies by default (fail closed)", () => {
    const su = make({ role: "SUPER_ADMIN" });
    // Super-admin still wins on unknown shapes (early return).
    expect(can(su, "wibble:wobble" as never)).toBe(true);

    const agent = make({ role: "AGENT", planTier: "PRO" });
    expect(can(agent, "wibble:wobble" as never)).toBe(false);
  });
});
