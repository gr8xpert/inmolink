# ADR 0002 — Storage deduplication via content-addressable R2

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: User
- **Consulted**: Claude (research + recommendations)
- **Supersedes**: —
- **Relates to**: [ADR 0001](./0001-stack-choice.md), [PLAN.md §5.1](../../PLAN.md)

## Context

At Inmolink's ceiling target (5,000 agents × 30K properties × ~50 images per property + video + floor plans), we expect **~7.5 billion image objects** in R2. Real estate is unusually dedup-friendly:

- **Re-imports**: Kyero / Resale Online feeds re-deliver the same image URLs on every sync. Every sync would otherwise re-upload identical bytes.
- **Cross-agency listings**: same property listed by multiple agents (MLS sharing) → identical originals.
- **Stock / placeholder content**: agency logo overlays, "image coming soon" placeholders, default floor-plan templates.
- **Variant pipeline is deterministic**: same input + same encoder + same target spec → byte-identical output. The 4 WebP variants we generate for a duplicated original are themselves byte-identical.

Without dedup, we pay for 7.5B objects × ~0.5MB average = ~3.75PB of R2 storage, much of which is redundant. Realistic dedup ratio: **30-50%**.

R2 doesn't dedup natively (no major object store does — S3 / GCS / R2 are all pay-per-byte-stored). We need application-layer dedup.

We considered:

1. **Skip dedup, store everything** — simplest, ~$$$$ wasted at ceiling.
2. **Per-agency hash table** — dedup within an agency but not across. Smaller savings, simpler privacy story.
3. **Global content-addressable store** — one MediaObject row per unique hash, cross-agency. Maximum savings.
4. **Outsource to Cloudflare Cache Reserve** — won't help because R2 storage cost is the issue, not bandwidth.
5. **Perceptual hashing (pHash)** — detects near-duplicates (same image at different JPEG quality). Useful for "same property listed twice" detection but lossy and slower; not a replacement for exact-bytes dedup.

## Decision

**Implement application-layer global content-addressable storage** on R2 from day 1.

### Schema additions

```
MediaObject {
  id              cuid PK
  hash            sha256 hex string, UNIQUE
  r2Key           derived from hash, e.g. "media/<h0..1>/<h2..3>/<hash>"
  bytes           int
  mimeType        string
  width, height   int (images)
  durationSec     int (videos)
  refCount        int  -- atomic increment/decrement
  pipelineVersion int  -- bumped if encoder settings change
  scheduledDeleteAt timestamptz nullable  -- now + 7d when refCount hits 0
  createdAt
}

MediaVariant {
  id                 cuid PK
  sourceMediaObjectId FK -> MediaObject
  hash               sha256 hex string, UNIQUE
  format             webp | jpeg
  sizeName           thumb | small | medium | large
  width, height      int
  bytes              int
  refCount           int
  pipelineVersion    int
}

PropertyImage / PropertyFloorPlan / PropertyVideo {
  -- carry per-property metadata only:
  propertyId, mediaObjectId FK, altText, position, isCover, ...
  -- no R2 keys here; resolve via MediaObject
}
```

### Upload flow

1. Browser computes SHA-256 of the file (Web Crypto API, ~ms even for 50MB).
2. Browser asks API: `POST /api/images/check-existing` with the hash.
3. API:
   - Hash exists → returns existing `mediaObjectId`, increments `refCount` atomically.
   - Hash unknown → returns a signed PUT URL keyed by `media/<hash[0:2]>/<hash[2:4]>/<hash>`.
4. Browser uploads to R2 only if needed.
5. API creates `MediaObject` row (`refCount=1`) on first sight via `INSERT ... ON CONFLICT (hash) DO UPDATE SET refCount = refCount + 1 RETURNING *` — handles the race where two agents upload identical content simultaneously.
6. Server **re-hashes on receive** (defense against malicious / buggy clients claiming a hash they don't actually have).
7. App creates the `PropertyImage` row referencing `mediaObjectId`.
8. Worker enqueues variant generation for new MediaObjects (lazy: thumb + medium eager, small + large on first request).

### Variant flow

For each (sourceMediaObject, sizeName, format) tuple:
- Compute the variant hash *after* generation.
- Look up `MediaVariant` by hash.
- If exists (e.g. another agent's identical image already produced this variant): increment refCount, link.
- If new: upload to R2 keyed by variant hash, create row with `refCount=1`.

### Delete flow

1. PropertyImage row deleted → atomic decrement of `MediaObject.refCount`.
2. When `refCount` reaches 0: set `scheduledDeleteAt = now + 7 days` (grace period — protects against re-creates and accidental orphans).
3. Daily worker job: `DELETE FROM media_objects WHERE refCount = 0 AND scheduledDeleteAt < NOW()` → for each, also delete the R2 object and cascading variants.

### Dedup boundary

**Global** (cross-agency). Hash collision = bit-for-bit content equality, not a privacy leak. The privacy concern (Agent A probing whether Agent B uploaded a specific image) is mitigated by:

- Never expose `MediaObject.hash` directly in API responses (only `mediaObjectId` opaque keys)
- The `check-existing` endpoint returns a boolean ("you already have access") not "this hash exists in the system"
- Per-property metadata (altText, isCover, position, propertyId, captioning, audit trail) lives on `PropertyImage` and is never shared

## Consequences

### Positive

- **30-50% R2 storage savings** at scale. At 7.5B-image ceiling that's TB-scale cost reduction over time.
- Variant dedup compounds the savings: shared cover image → shared 4 WebP variants + 1 JPEG.
- Faster re-imports: feed dedup means worker skips the upload step for unchanged images.
- Cross-agency sharing UX: same image used in multiple listings has consistent CDN URL.
- Defense against bug-induced duplicate uploads (client re-tries, network glitches).

### Negative / trade-offs

- **Schema complexity**: extra `MediaObject` + `MediaVariant` tables, refcount state, foreign keys. Property*Media tables become indirection layers.
- **Race condition risk**: two simultaneous uploads of identical content. Mitigated by `INSERT ... ON CONFLICT` atomic upsert + retry logic.
- **Refcount integrity**: drift between actual references and `refCount` would cause either premature deletes or storage leaks. Mitigated by:
  - Triggers on PropertyImage/FloorPlan/Video INSERT/DELETE/UPDATE that auto-adjust refCount
  - Periodic reconciler job that recomputes refCount via `SELECT COUNT(*)` and corrects drift
- **Pipeline versioning**: if we change encoder settings (sharp version bump, WebP quality change), variants of existing MediaObjects become stale. Mitigated by `pipelineVersion` field; old variants stay valid until orphaned.
- **Server re-hash overhead**: ~10-50ms per upload (depending on size) to validate client's claimed hash. Negligible compared to upload time.
- **Browser SHA-256 cost**: ~0-50ms for typical images, up to ~500ms for 50MB videos. Acceptable; runs off the main thread via Web Crypto.
- **Cleanup correctness**: 7-day grace + reconciler covers most edge cases. Documented runbook required for emergency restore (e.g., accidental bulk delete).

### Open

- Should we hash with **BLAKE3** instead of SHA-256? BLAKE3 is ~5× faster, equally collision-resistant in practice, but Web Crypto API doesn't support it natively → would need a JS implementation in the browser. Sticking with SHA-256 for v1.
- Should we add **pHash near-duplicate detection** later as a UX feature (flag potential duplicate listings across agents — relevant for the commission split flow)? Deferred to v1.5.
- At what scale does R2's per-object overhead (~$0.36 per million Class A operations) become significant relative to the storage savings? Watch metrics; revisit if Class A ops exceed storage cost.

## Related

- [PLAN.md §5 Storage & Media](../../PLAN.md), specifically §5.1 (Storage Deduplication subsection)
- [PLAN.md §10 Data Model — Properties](../../PLAN.md) (MediaObject + MediaVariant inventory)
- [ADR 0001](./0001-stack-choice.md) — Stack choice (R2 selection)
