import { describe, expect, it } from "vitest";
import {
  StorageObjectMissingError,
  hashFromKey,
  keyFromHash,
  variantKeyFromHash,
} from "./interface";

const VALID_HASH = "a".repeat(64);
const ANOTHER_HASH = "0123456789abcdef".repeat(4); // 64 hex
const SHORT_HASH = "abc";
const UPPER_HASH = "A".repeat(64);

describe("keyFromHash", () => {
  it("derives the canonical media/<a>/<b>/<hash> path", () => {
    expect(keyFromHash(VALID_HASH)).toBe(`media/aa/aa/${VALID_HASH}`);
    expect(keyFromHash(ANOTHER_HASH)).toBe(`media/01/23/${ANOTHER_HASH}`);
  });

  it("rejects non-64-char hashes", () => {
    expect(() => keyFromHash(SHORT_HASH)).toThrow();
    expect(() => keyFromHash("a".repeat(63))).toThrow();
    expect(() => keyFromHash("a".repeat(65))).toThrow();
  });

  it("rejects uppercase hex (forces lowercase canonical form)", () => {
    expect(() => keyFromHash(UPPER_HASH)).toThrow();
  });

  it("rejects non-hex characters", () => {
    expect(() => keyFromHash(`${"a".repeat(63)}g`)).toThrow();
  });
});

describe("variantKeyFromHash", () => {
  it("uses the variants/ prefix (separate orphan-scan namespace from originals)", () => {
    expect(variantKeyFromHash(VALID_HASH)).toBe(`variants/aa/aa/${VALID_HASH}`);
    expect(variantKeyFromHash(ANOTHER_HASH)).toBe(`variants/01/23/${ANOTHER_HASH}`);
  });

  it("shares the same hash validation as keyFromHash", () => {
    expect(() => variantKeyFromHash(SHORT_HASH)).toThrow();
    expect(() => variantKeyFromHash(UPPER_HASH)).toThrow();
  });
});

describe("hashFromKey", () => {
  it("extracts hash from a media/ key", () => {
    expect(hashFromKey(`media/aa/aa/${VALID_HASH}`)).toBe(VALID_HASH);
  });

  it("extracts hash from a variants/ key", () => {
    expect(hashFromKey(`variants/01/23/${ANOTHER_HASH}`)).toBe(ANOTHER_HASH);
  });

  it("returns null for keys with the wrong shape", () => {
    expect(hashFromKey("nope")).toBeNull();
    expect(hashFromKey(`other/aa/aa/${VALID_HASH}`)).toBeNull();
    // Wrong directory depth.
    expect(hashFromKey(`media/aa/${VALID_HASH}`)).toBeNull();
    // Hash too short.
    expect(hashFromKey("media/aa/aa/abc")).toBeNull();
  });

  it("returns null for keys whose dir prefix doesn't match the hash", () => {
    // Defensive: hashFromKey only checks the regex shape, not that the
    // directory letters actually correspond to the hash. Currently the
    // function does NOT enforce that — document the behaviour so a
    // future tightening is a deliberate choice.
    const key = `media/zz/zz/${VALID_HASH}`;
    // 'z' isn't in [a-f0-9] so the regex rejects it → null.
    expect(hashFromKey(key)).toBeNull();
  });

  it("inverse of keyFromHash", () => {
    expect(hashFromKey(keyFromHash(VALID_HASH))).toBe(VALID_HASH);
    expect(hashFromKey(variantKeyFromHash(ANOTHER_HASH))).toBe(ANOTHER_HASH);
  });
});

describe("StorageObjectMissingError", () => {
  it("carries the key on the instance + has a stable code", () => {
    const err = new StorageObjectMissingError("media/aa/aa/abc");
    expect(err).toBeInstanceOf(StorageObjectMissingError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("STORAGE_OBJECT_MISSING");
    expect(err.key).toBe("media/aa/aa/abc");
    expect(err.name).toBe("StorageObjectMissingError");
    expect(err.message).toContain("media/aa/aa/abc");
  });
});
