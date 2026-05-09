import { type Storage, StorageObjectMissingError } from "@inmolink/storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted to the top of the file — references inside the
// factory must be declared via vi.hoisted so they're available when the
// hoisted mock evaluates, not later when the test file's body runs.
const mediaObject = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@inmolink/db", () => ({
  prisma: { mediaObject },
}));

const enqueueEagerImageVariants = vi.hoisted(() => vi.fn());
vi.mock("../../lib/queues", () => ({
  enqueueEagerImageVariants,
}));

import { UploadMissingError, UploadVerifyError, registerUploads, signUploads } from "./service";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const fakeStorage = (): Storage =>
  ({
    kind: "r2",
    createUploadUrl: vi.fn(async ({ key }: { key: string }) => ({
      uploadUrl: `https://example.com/upload/${key}`,
      key,
      expiresAt: new Date(Date.now() + 600_000),
      requiredHeaders: { "content-type": "image/jpeg" },
    })),
    fetchAndHash: vi.fn(),
    download: vi.fn(),
    put: vi.fn(),
    exists: vi.fn(),
    delete: vi.fn(),
    publicUrl: (key: string) => `https://cdn.example.com/${key}`,
  }) as unknown as Storage;

const fakeQueue = (): unknown => ({});

beforeEach(() => {
  for (const fn of Object.values(mediaObject)) (fn as { mockReset: () => void }).mockReset();
  enqueueEagerImageVariants.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("signUploads", () => {
  it("returns 'exists' for hashes already in the MediaObject table (dedup hit)", async () => {
    const storage = fakeStorage();
    mediaObject.findMany.mockResolvedValue([
      { id: "mo-1", hash: HASH_A, r2Key: `media/aa/aa/${HASH_A}` },
    ]);

    const res = await signUploads(storage, {
      files: [{ hash: HASH_A, mimeType: "image/jpeg", bytes: 1000 }],
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({
      hash: HASH_A,
      status: "exists",
      mediaObjectId: "mo-1",
      publicUrl: `https://cdn.example.com/media/aa/aa/${HASH_A}`,
    });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 'upload' with a signed URL for novel hashes", async () => {
    const storage = fakeStorage();
    mediaObject.findMany.mockResolvedValue([]);

    const res = await signUploads(storage, {
      files: [{ hash: HASH_B, mimeType: "image/jpeg", bytes: 2000 }],
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({
      hash: HASH_B,
      status: "upload",
      key: `media/bb/bb/${HASH_B}`,
    });
    expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
    expect(storage.createUploadUrl).toHaveBeenCalledWith({
      key: `media/bb/bb/${HASH_B}`,
      mimeType: "image/jpeg",
      bytes: 2000,
    });
  });

  it("mixes dedup hits + novel files in the same response (per-file outcome)", async () => {
    const storage = fakeStorage();
    mediaObject.findMany.mockResolvedValue([
      { id: "mo-1", hash: HASH_A, r2Key: `media/aa/aa/${HASH_A}` },
    ]);

    const res = await signUploads(storage, {
      files: [
        { hash: HASH_A, mimeType: "image/jpeg", bytes: 1000 },
        { hash: HASH_B, mimeType: "image/png", bytes: 2000 },
      ],
    });

    expect(res.results.map((r) => r.status)).toEqual(["exists", "upload"]);
    expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe("registerUploads", () => {
  it("returns id without re-fetching when MediaObject already exists", async () => {
    const storage = fakeStorage();
    const queue = fakeQueue();
    mediaObject.findUnique.mockResolvedValue({
      id: "mo-1",
      bytes: 1000,
      r2Key: `media/aa/aa/${HASH_A}`,
    });

    const res = await registerUploads(storage, queue as never, {
      uploads: [{ hash: HASH_A, mimeType: "image/jpeg" }],
    });

    expect(res.results[0]).toMatchObject({
      hash: HASH_A,
      mediaObjectId: "mo-1",
      bytes: 1000,
    });
    expect(storage.fetchAndHash).not.toHaveBeenCalled();
    expect(mediaObject.create).not.toHaveBeenCalled();
    expect(enqueueEagerImageVariants).not.toHaveBeenCalled();
  });

  it("throws UploadMissingError when the storage object is absent", async () => {
    const storage = fakeStorage();
    mediaObject.findUnique.mockResolvedValue(null);
    (storage.fetchAndHash as ReturnType<typeof vi.fn>).mockRejectedValue(
      new StorageObjectMissingError(`media/cc/cc/${HASH_C}`),
    );

    await expect(
      registerUploads(storage, fakeQueue() as never, {
        uploads: [{ hash: HASH_C, mimeType: "image/jpeg" }],
      }),
    ).rejects.toBeInstanceOf(UploadMissingError);
  });

  it("throws UploadVerifyError when server-recomputed hash != client-claimed hash", async () => {
    const storage = fakeStorage();
    mediaObject.findUnique.mockResolvedValue(null);
    // Client claims A but bytes hash to B — that's the malicious-client
    // detection path /uploads/register exists for.
    (storage.fetchAndHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      hash: HASH_B,
      bytes: 1000,
    });

    await expect(
      registerUploads(storage, fakeQueue() as never, {
        uploads: [{ hash: HASH_A, mimeType: "image/jpeg" }],
      }),
    ).rejects.toBeInstanceOf(UploadVerifyError);
    expect(mediaObject.create).not.toHaveBeenCalled();
  });

  it("happy path: creates MediaObject + enqueues eager variants", async () => {
    const storage = fakeStorage();
    mediaObject.findUnique.mockResolvedValue(null);
    (storage.fetchAndHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      hash: HASH_A,
      bytes: 1234,
    });
    mediaObject.create.mockResolvedValue({
      id: "mo-new",
      bytes: 1234,
      r2Key: `media/aa/aa/${HASH_A}`,
    });
    const queue = fakeQueue();

    const res = await registerUploads(storage, queue as never, {
      uploads: [{ hash: HASH_A, mimeType: "image/jpeg" }],
    });

    expect(res.results[0]).toMatchObject({
      mediaObjectId: "mo-new",
      bytes: 1234,
      hash: HASH_A,
    });
    expect(mediaObject.create).toHaveBeenCalledOnce();
    const firstCall = mediaObject.create.mock.calls[0];
    if (!firstCall) throw new Error("create mock not called");
    const created = firstCall[0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      hash: HASH_A,
      bytes: 1234,
      mimeType: "image/jpeg",
      refCount: 0,
    });
    // 24h orphan grace per slice C / PLAN §5.1.
    expect(created.data.scheduledDeleteAt).toBeInstanceOf(Date);

    expect(enqueueEagerImageVariants).toHaveBeenCalledTimes(1);
    expect(enqueueEagerImageVariants).toHaveBeenCalledWith(queue, {
      mediaObjectId: "mo-new",
      sourceHash: HASH_A,
      mimeType: "image/jpeg",
    });
  });

  it("P2002 race: returns the existing MediaObject the other writer just inserted", async () => {
    const storage = fakeStorage();
    mediaObject.findUnique.mockResolvedValue(null);
    (storage.fetchAndHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      hash: HASH_A,
      bytes: 1234,
    });
    // Simulate the unique-constraint collision raised by Prisma when a
    // concurrent /register won the row.
    const race = Object.assign(new Error("Unique"), { code: "P2002" });
    mediaObject.create.mockRejectedValue(race);
    mediaObject.findUniqueOrThrow.mockResolvedValue({
      id: "mo-race",
      bytes: 1234,
      r2Key: `media/aa/aa/${HASH_A}`,
    });

    const res = await registerUploads(storage, fakeQueue() as never, {
      uploads: [{ hash: HASH_A, mimeType: "image/jpeg" }],
    });

    expect(res.results[0]).toMatchObject({ mediaObjectId: "mo-race" });
    expect(mediaObject.findUniqueOrThrow).toHaveBeenCalledOnce();
    // The losing writer should NOT enqueue duplicate variant jobs — the
    // winning writer already did.
    expect(enqueueEagerImageVariants).not.toHaveBeenCalled();
  });
});
