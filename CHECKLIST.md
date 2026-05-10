# Inmolink — Build Checklist

> Living progress tracker. Source of truth for what's planned: [PLAN.md](./PLAN.md). Source of truth for what's *actually shipped*: this file.
>
> Update conventions:
> - `[x]` = done & committed (refer to commit hash if cross-session)
> - `[/]` = in progress (started but not landed)
> - `[ ]` = todo
> - `~~text~~` = explicitly descoped (move to "Deferred" at bottom)

---

## Sprint 0 — Foundation ✅ COMPLETE

- [x] Repo scaffold (turbo + pnpm + biome + tsconfig + editorconfig + gitattributes)
- [x] All 4 apps + 8 packages with minimal entry points (`9b81961`)
- [x] Full Prisma schema — 50 models, 25 enums (`7089ecc`)
- [x] First Prisma migration applied (`20260509165343_init`)
- [x] docker-compose stack: Postgres 16 + Redis 7 + Meilisearch v1.12
- [x] Postgres init.sql, Nginx config templates, PM2 ecosystem.config.cjs
- [x] GitHub Actions CI: lint + typecheck + prisma-validate + test + build
- [x] Dependabot weekly grouped + monthly Actions
- [x] Husky + lint-staged pre-commit hooks
- [x] PR template
- [x] `pnpm-lock.yaml` committed
- [x] Documentation: PLAN.md, README, CLAUDE.md, ARCHITECTURE, CHANGELOG, TROUBLESHOOTING, ADRs 0001–0003
- [x] Kyero sample fixture + connector schema notes
- [x] Local dev stack boot: docker-compose + Prisma migrate + seed + `pnpm dev` all 4 apps
- [x] Environment config + `.env` files for web/public/api/worker/db
- [ ] Step 7: First deploy to VPS (deferred — finish locally first per user)

---

## Sprint 1 — Properties Core 🔧 IN PROGRESS

### A — Auth.js v5 sign-in ✅ (commit `52a1873`)

- [x] Auth.js v5 split-config (Edge + Node) per authjs.dev/guides/edge-compatibility
- [x] Credentials provider with Argon2id verify
- [x] JWT session strategy (30-day cookies)
- [x] Module augmentation for Session.user.{role, agencyId} + JWT.{userId, role, agencyId}
- [x] Sign-in page at `/[locale]/sign-in` (Server Action, error redirects)
- [x] Dashboard placeholder at `/[locale]/dashboard` (auth-protected)
- [x] Sign-out form action
- [x] middleware composes Auth.js + next-intl
- [x] webpack `externals` + `serverExternalPackages` for `@node-rs/argon2`
- [x] Dropped `--turbopack` (incompatible with native module externals)
- [x] Stripped `.js` extensions from intra-package imports
- [x] Dev seed sets admin password (`Inmolink-Dev-2026!`)
- [x] Verified end-to-end: CSRF → POST credentials → dashboard 200

### B — Property CRUD API ✅ (commit `244a222`)

- [x] `installAuth(app, { secret })` Fastify hook reads Auth.js v5 cookie + decodes via `next-auth/jwt`
- [x] `request.requireUser()` throws 401 with `code: "UNAUTHENTICATED"`
- [x] `propertySchemas` namespace in `@inmolink/shared` (Zod create/update/list/detail)
- [x] Repository: `listProperties` (cursor-paginated), `getPropertyById`, `createProperty`, `updateProperty`, `softDeleteProperty`
- [x] Service: ownership rules (SUPER_ADMIN > AGENCY_ADMIN within agency > AGENT own only)
- [x] Visibility filter applied per session (PLAN §3)
- [x] PRIVATE properties hidden from non-owner (404, no existence leak)
- [x] PropertyTranslation upsert by (propertyId, locale)
- [x] PropertyFeature m2m replacement on update
- [x] Soft delete sets `hardDeleteAt = now + 30d`
- [x] Routes registered at `/api/dashboard/properties` (GET / GET:id / POST / PATCH / DELETE)
- [x] OpenAPI auto-spec at `/docs`
- [x] Verified: 401 unauthed, 200 authed list with empty results

### C — R2 storage abstraction + upload pipeline ✅

- [x] `@inmolink/storage` package: Storage interface + R2Storage (S3-compat, verified against current Cloudflare R2 docs) + LocalFsStorage (dev fallback)
- [x] `keyFromHash()` canonical key derivation (`media/<h0..1>/<h2..3>/<hash>`)
- [x] R2 / LocalFs factory in `apps/api/src/storage.ts` (auto-pick based on `R2_ENDPOINT` presence)
- [x] Local-storage Fastify route for dev (`PUT /api/_local-storage/upload` + `GET /api/_local-storage/serve` with HMAC-signed tokens, Range support)
- [x] `POST /api/uploads/sign` — accepts hashes, returns existing `mediaObjectId` for dedup hits or signed PUT URL for novel content
- [x] `POST /api/uploads/register` — server re-fetches + re-hashes (defense vs malicious clients), creates MediaObject
- [x] `MediaObject` create with race-safe handling (P2002 retry on simultaneous registrations)
- [x] `refCount` initialized to 0 + 24h `scheduledDeleteAt` orphan grace (cleanup worker reaps in slice E)
- [x] Upload schemas in `@inmolink/shared` (`uploadSchemas` namespace)
- [x] Verified end-to-end: sign → PUT → register → re-sign hits dedup → GET returns identical bytes with matching hash

### Post-review hardening ✅ (commit `b48ec2d`)

- [x] P0-1: callbackUrl validated to same-origin path on `/sign-in` (open-redirect fix)
- [x] P0-2: `/uploads/register` TOCTOU collapsed — typed `StorageObjectMissingError` from `fetchAndHash`, dropped separate `exists()` precheck
- [x] P0-3: R2 presigned PUT now binds `content-type` via `signableHeaders` (prevents MIME swap at upload)
- [x] P1-5: `ENCRYPTION_KEY` validated as 64-char lowercase hex (32 bytes); both `apps/api` + `apps/worker` configs; `.env.example` updated; dev `.env` keys regenerated

### D — Image variant generation worker ✅ (commit `6be4676`)

- [x] BullMQ processor on `IMAGE_VARIANT` queue (sharp pipeline)
- [x] WebP variants at thumb (200) / small (480) / medium (1080) / large (1920)
- [x] +1 JPEG fallback at "large" — generated on demand for the cover image (lazy resolver)
- [x] Each variant content-addressable: SHA-256 of output, `MediaVariant.hash` UNIQUE
- [x] Lazy: thumb + medium eagerly enqueued on `/uploads/register`; small / large / cover-JPEG on first request via `resolveOrEnqueueVariant`
- [x] `Storage.download(key)` + `Storage.put(key, body, ct)` added to interface; R2 + LocalFs impls
- [x] `variantKeyFromHash()` — variants under separate `variants/` prefix (independent orphan scan)
- [x] Shared variant contract in `@inmolink/shared` (`mediaSchemas`): `VARIANT_SIZES`, `EAGER_VARIANTS`, `PIPELINE_VERSION = 1`, `imageVariantJobId()` for stable BullMQ dedup
- [x] API queue producer (`apps/api/src/lib/queues.ts`) — attempts 5, exp backoff 5s, removeOnComplete age 1h, removeOnFail count 200; drained on `app.close()`
- [x] Same-source dedup + cross-source refCount bump on output-hash collision (P2002 race collapses to bump)
- [ ] *(deferred)* Update `PropertyImage.variants` JSON manifest — there is no manifest field today; lazy resolver returns variant URLs directly. Manifest can land in slice G if the public page benefits.

### E — PropertyImage attach + media management ✅ (commit `f097300`)

- [x] Schema migration `20260509201152_slice_e_media_orphan_tracking`:
  - [x] `MediaObject.refCount` default `1` → `0` (matches service insert; closes review P1-3)
  - [x] `MediaVariant.sourceMediaObjectId` nullable; FK Cascade → SetNull
  - [x] `MediaVariant.scheduledDeleteAt` + index for orphan scan
- [x] `POST /api/dashboard/properties/:id/images` — bulk attach 1–50; validates `image/*` MIME; transactional refCount++ + clear `scheduledDeleteAt` + cover-uniqueness
- [x] `PATCH /api/dashboard/properties/:id/images/:imageId` — alt text, position, isCover (with cover-uniqueness)
- [x] `DELETE /api/dashboard/properties/:id/images/:imageId` — drop row + refCount-- ; if 0 set `scheduledDeleteAt = NOW()+7d`
- [x] `GET /api/dashboard/properties/:id/images` — list endpoint (slice F.1 extension); same read scope as detail
- [x] `MEDIA_CLEANUP` worker — repeatable scheduler (BullMQ `upsertJobScheduler`), pattern `0 0 3 * * *` (daily 03:00:00), idempotent on every boot
- [x] Pass 1: MediaObject orphans → decrement variant refCounts (schedule each at 7d if drops to 0), delete source blob, delete row
- [x] Pass 2: MediaVariant orphans → delete blob, delete row. Storage failures logged + DB GC continues. Batch 500/pass.
- [x] `propertyImageSchemas` in `@inmolink/shared` — attach (max 50) + patch (refine non-empty) + response wrappers + list

### F.1 — Web dashboard property UI (read-only path) ✅ (commit `6576d89`)

- [x] `<AgencyBadge>` shared component in `@inmolink/ui` — Server-Component-safe, two sizes (sm cards / md detail headers)
- [x] `/[locale]/dashboard/properties` — list page (cursor pagination, status chip per row, locale-aware money + date)
- [x] `/[locale]/dashboard/properties/[id]` — detail view (cover + gallery + key-facts grid + best-translation pick)
- [x] `apps/web/src/lib/api.ts` — `apiFetch<T>` with cookie forwarding via `next/headers` (Auth.js cookie reaches Fastify on `:3001`); typed `ApiError`
- [x] `apps/web/src/lib/format.ts` — locale-aware `Intl` money + date
- [x] i18n: `properties` namespace populated in en/es/de/fr (status / visibility / transaction enums + page strings)

### F.2 — Web dashboard property UI (create form) ✅ (commit `fb0cde4`)

- [x] `/[locale]/dashboard/properties/new` — Server Component shell + `PropertyCreateForm` Client Component (RHF + Zod resolver)
- [x] Locale tabs: en required, es/de/fr optional (dropped from payload if title+description blank)
- [x] Slug auto-derives from title via Unicode-property slugify (`\p{M}` strips diacritics)
- [x] `createPropertyAction` Server Action — POSTs to `/api/dashboard/properties` via `apiFetch`; success redirects server-side to detail; error returned typed for inline rendering
- [x] Two-step Zod: permissive form schema → re-validated against canonical `propertyCreateSchema` before send
- [x] Taxonomy module: `GET /api/dashboard/property-types` + `GET /api/dashboard/locations` — locale-aware (?locale=, falls back en → first); new `taxonomySchemas` in `@inmolink/shared`
- [x] Seed extension: `Residential` PropertyTypeGroup + 5 PropertyTypes (Apartment/House/Villa/Plot/Commercial) + Spain country + 3 cities (Málaga/Madrid/Barcelona) — all 4 locale translations, idempotent
- [x] `.input` Tailwind component class for neutral form styling
- [x] gitignore: `apps/*/tmp/` (dev LocalFsStorage volume)

### F.3.a — Image upload widget ✅

- [x] `ImageUploader` Client Component — drag-drop + file picker, Web Crypto SHA-256, dimension detection via `createImageBitmap`, per-file status (Queued / Hashing / Signing / Uploading / Registering / Attaching / Done / Error)
- [x] 3 Server Actions: `signUploadsAction`, `registerUploadsAction`, `attachImagesAction` (cookie-forwarding `apiFetch` keeps cookie/CORS off the table)
- [x] `attachImagesAction` calls `revalidatePath` so the detail-page gallery refreshes; client also calls `router.refresh()`
- [x] Detail page renders uploader only for owners (SUPER_ADMIN / AGENCY_ADMIN of agency / AGENT owner)
- [x] UI caps: 25 MB per file, 20 files per batch (api caps stay 500 MB / 50)
- [x] `uploadImages` i18n key in all 4 locales

### F.3.b — Edit form + image management ✅

- [x] `/[locale]/dashboard/properties/[id]/edit` — Server Component shell + `PropertyForm` in edit mode (prefilled from detail, validated against `propertyUpdateSchema`)
- [x] `PropertyForm` consolidated into `_components/` with `mode: "create" | "edit"` discriminated union; both pages share it
- [x] `updatePropertyAction` server action — PATCH to api, redirect on success, typed error on failure
- [x] Non-owners redirected from edit page (defense-in-depth; api enforces too)
- [x] `ImageManager` Client Component (owner-only): alt-text on blur, Set-as-cover, up/down reorder, Delete (confirm)
- [x] Reorder via `swapImagePositionsAction` (parallel PATCHes with temporary position collision tolerated by the api's ordering)
- [x] "Edit" CTA on detail page header (owner-only)
- [x] `edit` i18n key in all 4 locales
- [ ] *(deferred to slice G)* Surface variant URLs from the lazy resolver on the detail page
- [ ] *(deferred)* PropertyFloorPlan + PropertyVideo attach endpoints + UI — same shape as PropertyImage

### G.1 — Public marketplace property detail ✅

- [x] `/[locale]/property/[slug]-[id]` — Server Component, `revalidate: 300` (PLAN §11.4)
- [x] Slug-mismatch redirect (canonical URL via permanentRedirect)
- [x] Missing/deleted properties 301 home (PLAN: never 404 public pages)
- [x] JSON-LD `RealEstateListing` (name / description / images / Offer / numberOfRooms / floorSize)
- [x] OpenGraph + Twitter Card meta via `generateMetadata`
- [x] AgencyBadge in header (from `@inmolink/ui`)
- [x] `/api/public/properties/:id` + `/api/public/properties/:id/images` anonymous endpoints, `visibility=PUBLIC + status=ACTIVE + deletedAt=NULL` hard filter
- [x] Address + postcode stripped from public response (privacy)
- [x] `publicPropertySchemas` in `@inmolink/shared`
- [x] `apps/public/src/lib/api.ts` (anonymous, ISR-friendly) + format helpers

### G.2 — Public search / list ✅

- [x] `/[locale]/search` — Server Component with URL-driven filters (shareable + back-button-friendly)
- [x] `SearchFilters` Client Component — q / transactionType / propertyTypeId / locationId / minPriceCents / maxPriceCents / bedrooms
- [x] `GET /api/public/properties` — cursor pagination, filter set above, free-text via Prisma `contains` insensitive on title + description (Meilisearch lands Sprint 3)
- [x] Result cards: cover thumbnail, AgencyBadge, title, price, beds/baths/m². Link to canonical `/[locale]/property/<slug>-<id>`.
- [x] Cursor next-page link carries forward filters
- [x] ISR `revalidate: 60` for filtered queries
- [x] Taxonomy `GET /property-types` + `/locations` made anonymous
- [x] Home page CTA → `/search`
- [ ] *(deferred Sprint 3)* Variant URLs in detail/list responses (lazy resolver hydration)
- [ ] *(deferred Sprint 3)* Meilisearch swap (per-locale indices, faceting)

### H — Tests ✅ (vitest only; e2e deferred)

- [x] Vitest unit: dedup logic in upload service (`apps/api/src/modules/uploads/service.test.ts` — 8 tests, prisma + queue mocked via `vi.hoisted`)
- [x] Vitest unit: permission `can()` matrix (`packages/auth/src/can.test.ts` — 12 tests, every role × action × tier combo)
- [x] Vitest unit: storage key helpers (`packages/storage/src/interface.test.ts` — 12 tests on keyFromHash / variantKeyFromHash / hashFromKey + StorageObjectMissingError)
- [x] `pnpm test` runs the whole matrix via Turbo (32 / 32 passing)
- [ ] **Playwright E2E** — explicitly deferred to **Sprint 12** (per PLAN §11.12 "Pressure test + launch"). Rationale: full E2E needs the dev stack running with R2 wired; the user explicitly mentioned no R2 account yet. Sprint 12 ships seed-load-test + Playwright harness alongside the production smoke tests.

---

## Sprint 2 — Locations / Property Types / Features (super-admin curated) ✅ COMPLETE

### 2.A — PropertyType + PropertyTypeGroup curation ✅

- [x] `requireSuperAdmin()` Fastify request helper (401 anon, 403 non-super-admin)
- [x] API: `/api/dashboard/admin/property-type-groups/*` (CRUD + reorder)
- [x] API: `/api/dashboard/admin/property-types/*` (CRUD + reorder + suggest-icon + accept-ai-icon)
- [x] 409 on delete-with-children (groups with types) or delete-with-references (types with properties)
- [x] PATCH replaces translations wholesale (single transaction)
- [x] Web `/[locale]/dashboard/admin` super-admin landing (server-side role redirect)
- [x] Web `/[locale]/dashboard/admin/property-types` — groups + types CRUD with inline edit, 4-locale translation tabs, auto-slug, isActive toggle
- [x] AI icon suggester button (calls Claude Haiku via `@inmolink/ai`); admin-override flag tracking
- [x] Up/down arrow reorder (per-row swap) — drag-drop deferred to a polish slice
- [x] Dashboard home surfaces "Admin" tile for super-admins
- [x] `adminPropertyTypeSchemas` in `@inmolink/shared`

### 2.B — Feature + FeatureGroup curation ✅ (commit `f385b19`)

- [x] API `/api/dashboard/admin/feature-groups/*` (CRUD + reorder)
- [x] API `/api/dashboard/admin/features/*` (CRUD + reorder + suggest-icon + accept-ai-icon)
- [x] AI suggester catalog tuned for amenities (41 Lucide icons, hint `"Feature (amenity)"`)
- [x] Web `/[locale]/dashboard/admin/features` — same UX as property-types but without slug + iconKind
- [x] Admin landing tile replaces the placeholder
- [x] `adminFeatureSchemas` in `@inmolink/shared`
- [x] *(landed as 2.E.5)* Shared taxonomy helpers (`_shared/taxonomy.ts`) — full `taxonomyAdminFactory` declined: divergent invariants across the four entities (tree vs flat / m2m vs translations / with vs without slug or icon kind) would have forced N config flags that defeat the abstraction. Shared error classes + `assertReorderSetMatch` capture the meaningful dedup at low risk.

### 2.C.1 — Location tree curation ✅

- [x] API `/api/dashboard/admin/locations/*` (CRUD + reorder)
- [x] 4-level hierarchy validation (COUNTRY → REGION → CITY → AREA) on create; 422 INVALID_HIERARCHY on mismatch
- [x] `level` + `parentId` immutable on PATCH (re-parenting deferred to a dedicated endpoint)
- [x] 409 on delete-with-children OR delete-with-property-refs
- [x] Position is per-(parent + level); reorder swaps with same-parent occupant
- [x] `childCount` denormalised into response
- [x] Web `/[locale]/dashboard/admin/locations` — recursive tree view with expand/collapse, level-aware "+ child" button, inline edit, lat/long + countryCode + SEO meta per locale, per-sibling reorder
- [x] Admin landing tile replaces placeholder
- [x] `adminLocationSchemas` in `@inmolink/shared` (with `VALID_CHILD_LEVEL` constant exported for the UI)

### 2.C.2 — LocationGroup m2m membership editor ✅ (commit `409e7fc`)

- [x] API `/api/dashboard/admin/location-groups/*` (group CRUD + reorder)
- [x] Three dedicated membership endpoints — add / remove / reorder member (separate from group PATCH so the picker doesn't ride on wholesale-replace)
- [x] 409 on add-when-already-member
- [x] Group delete cascades members (Prisma `onDelete: Cascade`)
- [x] Response denormalises member metadata (`name`, `level`, `countryCode`)
- [x] Web `/[locale]/dashboard/admin/location-groups` — group list + per-group member editor with up/down/remove + filtered `<select>` picker
- [x] Admin landing tile added
- [x] `adminLocationGroupSchemas` in `@inmolink/shared`
- [x] *(landed as 2.E.4)* Combobox autocomplete replaces the member `<select>` (and the move-picker `<select>` in admin/locations) — works at any catalog size, not just past a few hundred entries.

**Sprint 2 — COMPLETE** for PropertyType / Feature / Location / LocationGroup admin CRUD + drag-drop polish + filter UI + 2.E polish bundle (`/move`, `featureIds[]` facets, custom SVG icons, Combobox, shared helpers).

### 2.D — Drag-n-drop polish + filter UI ✅

- [x] Replace up/down arrows with `@dnd-kit/core` for groups + types + features + locations + group members
  - [x] **2.D.2.a — PropertyType admin** — `SortableList` primitive (generic, vertical-axis, parent-restricted, keyboard sensors). `reorder-all` endpoints replace single-step swaps. Pointer + touch + keyboard drag all work.
  - [x] **2.D.2.b — Feature admin** — `feature-groups/reorder-all` + `features/reorder-all` API; Client Component swaps the up/down arrows for drag handles on both groups and features-in-group.
  - [x] **2.D.2.c — Location admin (tree)** — `locations/reorder-all` API scoped to `(parentId, level)` tuple; recursive `TreeNode` renders one `SortableList` per sibling set so drags can't drift across parents or levels.
  - [x] **2.D.2.d — LocationGroup admin** — `location-groups/reorder-all` (groups) + `location-groups/members/reorder-all` (members within a group) API; Client Component projects `{...m, id: m.locationId}` into the SortableList input space since members are keyed by locationId.
  - [x] **2.E.1 — Location re-parenting** — `POST /locations/:id/move` (same-level only, cycle-checked); admin UI `MovePicker` + Combobox for candidate selection.
  - [x] **2.E.2 — featureIds[] multi-select** — public `/properties` query supports repeated `featureIds`; new `GET /api/dashboard/features` endpoint; checkbox-pill UI on `/search`.
  - [x] **2.E.3 — Custom SVG icon upload** — PropertyType admin Library/Custom radio + sign+register pipeline integration; `iconPublicUrl` decoration in routes layer; row preview renders actual SVG via `<img>` (never inline).
  - [x] **2.E.4 — Combobox autocomplete** — generic `apps/web/src/components/combobox.tsx`; replaces native `<select>` in admin/locations Move picker + admin/location-groups member picker.
  - [x] **2.E.5 — Taxonomy admin shared helpers** — `_shared/taxonomy.ts` consolidates `ConflictError` / `NotFoundError` / `InvalidHierarchyError` (was 4× duplicated) + `assertReorderSetMatch` (was 6× duplicated). Full factory deemed too costly given divergent invariants.
- [x] **2.D.1 — Filter UI on dashboard property list** — `PropertyFilters` Client Component with q / status / visibility / transactionType / propertyTypeId / locationId pickers. Server Component prefetches taxonomy in parallel; filters survive pagination via carry-forward.
- [x] **Public marketplace search facets** — `featureIds[]` multi-select shipped in 2.E.2 (AND semantics, cap 16, AND-composed `features.some` per id). Collapsible amenity-pill UI on `/[locale]/search`.
- [x] **Combobox autocomplete** shipped as 2.E.4 — replaces native `<select>` everywhere the catalog could realistically grow past tens of entries (admin/locations Move picker + admin/location-groups member picker).
- [x] **Taxonomy admin shared helpers** shipped as 2.E.5 — full factory declined; `_shared/taxonomy.ts` covers the high-value dedup. Note in the file explains the trade-off if anyone wants to revisit.
- [x] **Location re-parenting** shipped as 2.E.1 — `POST /locations/:id/move`, same-level only with cycle check. Cross-level moves with cascade re-leveling are deferred to a future iteration if a real use case appears (today's admin can solve the ~rare cross-level case by creating the target then deleting the source).
- [x] **Custom SVG icon upload for PropertyType** shipped as 2.E.3 — `image/svg+xml` in upload allowlist (50 KB UI cap), sign+register pipeline reused, `iconPublicUrl` resolved by routes layer, render via `<img>` only.

## Sprint 3 — Public marketplace MVP ✅ COMPLETE

### 3.A — Schema: Lead + LocationFAQ + repair migrations gitignore ✅ (commit `1205a97`)

- [x] `Lead` model — source enum, status enum, propertyId/agencyId FKs (SetNull on delete), salted ipHash, turnstileVerified flag
- [x] `LocationFAQ` model — per-location + per-locale Q&A, `@@unique(locationId, locale, position)`
- [x] Reverse rels: `Property.leads`, `Agency.leads`, `Location.faqs`
- [x] `.gitignore` repaired — re-include migrations under `*.sql` exclusion (prior migrations were never committed; fixed alongside the Sprint 3 migration)
- [x] Migration: `20260510110428_sprint_3_leads_faq`

### 3.B — Outbox writer: emit on Property mutations ✅ (commit `ce4757c`)

- [x] `@inmolink/shared/schemas/outbox` — typed payloads for `search.property.upsert` + `search.property.delete` topics, with `reason` discriminator
- [x] `apps/api/modules/outbox/service.ts` — `emitSearchPropertyUpsert/Delete(tx, payload)` requires a Prisma TransactionClient (atomic outbox + entity write)
- [x] `properties/repository.ts` — create + soft-delete wrapped in `$transaction`; update emits at end with `feature_change` vs `update` reason

### 3.C — @inmolink/search Meilisearch adapter ✅ (commit `ac6778f`)

- [x] `configureIndex(locale) / configureAllIndices()` — idempotent bootstrap with searchableAttributes / filterableAttributes / sortableAttributes / `publishedAt:desc` custom rank rule / `pagination.maxTotalHits = 5000`
- [x] `buildPropertyDocuments(p)` projection — pure function from Prisma row (with `propertyReindexInclude`) to per-locale search docs. Centralised indexable predicate (ACTIVE + PUBLIC) so worker / reindex / api stay aligned. `_geo` only when both lat + long present.
- [x] Per-locale fallback (en → first available) so a French-only listing still surfaces in /en/search

### 3.D — Worker: OUTBOX_DRAIN job + reindex script ✅ (commit `1b4eeb5`)

- [x] `outbox-drain` BullMQ processor on the existing `SEARCH_REINDEX` queue; scheduler ticks every 5 s
- [x] Topic dispatch — upsert: load row + project + upsertBatch; project returns [] (visibility flip) → delete; race-handled (deleted between emit + drain → delete)
- [x] Failures set `status=FAILED` + bumped attempts + `errorLast`
- [x] `scripts/reindex.ts` — full DR rebuild, cursor-paginated 500-row batches, `--dry-run` flag, `pnpm --filter @inmolink/worker reindex`

### 3.E — Public search routes use Meilisearch ✅ (commit `e2ff99a`)

- [x] `/api/public/properties` split: `q` present → Meilisearch with offset-based "search-cursor" (`o:` prefix), returns optional `facets`; `q` absent → Postgres + (createdAt, id) cursor (unchanged)
- [x] Re-hydrate hits from Postgres for cover/agency data; visibility/status filters re-applied as defense-in-depth
- [x] `publicPropertyListResponseSchema.facets` field added (optional)
- [x] apps/api wires `MeilisearchAdapter` in `app.ts` and passes to the route plugin

### 3.F — Location landing pages (4 levels + groups) ✅ (commit `26c19c1`)

- [x] `@inmolink/shared/schemas/public-location` — landing + group-landing payload shapes with breadcrumb / children / faqs / totalProperties
- [x] `GET /api/public/locations/landing?path=<slugs>&locale=<l>` — resolves up to 4 segments via (locale, slug); verifies parent chain
- [x] `GET /api/public/location-groups/landing?slug=<s>&locale=<l>` — composes each member's canonical `/buy/...` path by walking parents in JS
- [x] Descendant-inclusive property total (5 indexed queries max)
- [x] `apps/public/[locale]/buy/[[...path]]/page.tsx` — optional catch-all (1–4 segments); BreadcrumbList + Place + (optional) FAQPage JSON-LD; ISR 600 s
- [x] `apps/public/[locale]/region/[slug]/page.tsx` — group landing

### 3.G — Sitemap worker + robots.txt ✅ (commit `6939145`)

- [x] `SITEMAP_GENERATE` queue + daily 02:00 scheduler in `apps/worker`
- [x] `sitemap-generate` processor — cursor-paginated stream over Property/Location/LocationGroup; per-locale segments capped at 50K URLs; `xhtml:link rel="alternate" hreflang` per locale + `x-default` → /en on every URL
- [x] Output: `sitemaps/sitemap.xml` (index), `sitemap-properties-<loc>-NNNN.xml`, `sitemap-locations-<loc>.xml`, `sitemap-groups-<loc>.xml` — written to Storage
- [x] `GET /api/public/sitemaps/:filename` — proxy with strict allowlist regex on filename
- [x] `apps/public/sitemap.xml/route.ts` + `apps/public/sitemaps/[file]/route.ts` — proxy from api with edge cache; bare `/sitemap.xml` falls back to empty index on api outage
- [x] `robots.txt` → reads `NEXT_PUBLIC_PUBLIC_URL` (env-aware)
- [x] `PUBLIC_BASE_URL` worker env var

### 3.H — Anonymous lead form ✅ (commit `3cec872`)

- [x] `@inmolink/shared/schemas/lead` — `leadCreateSchema` with name + email|phone (.refine) + message + honeypot field
- [x] `POST /api/public/leads` — 10/hour rate limit, honeypot returns fake-success, agency resolved server-side from propertyId, salted ipHash
- [x] Returns 6-char user-facing reference (cuid suffix uppercased)
- [x] `contact-form.tsx` Client Component on property detail — CSS-hidden honeypot, fetch posts to api directly (anonymous; no cookie forwarding)
- [x] 4-locale messages.json `lead` namespace (en/es/de/fr)

### 3.I — hreflang + canonical + OG sweep ✅ (commit `b6dcbb7`)

- [x] `apps/public/src/lib/seo.ts` — `localeAlternates` (same-path) + `localeAlternatesByLocale` (per-locale slug variants)
- [x] Home (`/[locale]/`) — generateMetadata + canonical + hreflang + OG
- [x] Search (`/[locale]/search`) — generateMetadata + canonical + hreflang + OG
- [x] Property detail — `publicPropertyDetailSchema.alternateSlugs` populated from translations; per-locale hreflang
- [x] `/[locale]/buy/[[...path]]` + `/[locale]/region/[slug]` — same-path alternates (per-locale slug variants flagged as Sprint 4 polish)
- [x] x-default → /en on every alternates record

### Deferred to a follow-up

- [ ] Per-locale slug variants for Location + LocationGroup landing pages (currently same-path) — needs `alternateSlugs` field on the landing API response, mirroring property detail
- [ ] Sitemap viewer / debug UI in dashboard — manual-trigger button for "regenerate now"
- [ ] LocationFAQ admin UI (schema + reads exist; admin CRUD UI not built)
- [ ] Cloudflare Turnstile verification on lead submit (Sprint 4 — needs the platform Turnstile site key)

## Sprint 4 — Agencies + Profiles + 2FA + Settings ✅ COMPLETE

### 4.A — User profile + password + preferences ✅ (`fcab4c1`)

- [x] `meSchemas` in `@inmolink/shared` (profile / password / settings / detail)
- [x] `/api/dashboard/me/{,profile,password,settings}` — auto-create UserSettings on first read; password change verifies Argon2id + rehashes (rate-limited 5/5 min); slug-uniqueness collisions surface as 409
- [x] Web `/[locale]/dashboard/settings` landing + `/profile` + `/password` + `/preferences` (RHF + Zod, cookie-forwarded apiFetch, Server Actions)
- [x] 4-locale `settings` namespace + bonus `agency` / `invite` / `publicAgency` / `twoFactor` namespaces (consumed by 4.B–E)

### 4.B — Agency settings + branding ✅ (`692a393`)

- [x] `agencySchemas` (details / branding / translations / settings / detail)
- [x] `/api/dashboard/agency/{,details,branding,translations,settings}` — AGENCY_ADMIN-gated; SUPER_ADMIN may pass `?agencyId=` to manage any agency
- [x] Replace-translations wholesale per (agencyId, locale)
- [x] Web `/[locale]/dashboard/agency` single-page editor with four sections: Branding (R2 sign+register pipeline reused via shared `@/lib/uploads`), Details, Translations (4-locale tabs), Defaults (commission / SLA windows)
- [x] Logo / banner / hero upload with JPG/PNG/WebP cap of 10 MB

### 4.C — Agency invite flow ✅ (`b7eb452`)

- [x] `inviteSchemas` (create / accept-new / accept-existing / summary / for-accept / team)
- [x] Dashboard: `/api/dashboard/agency/team` + invites POST / :id/resend POST / :id DELETE — pending invites for the same email re-issue rather than stack pending tokens
- [x] Public: `/api/public/invites/:token` GET + `/accept-new` (anonymous; email taken from invite, not body, so no impersonation) + `/accept-existing` (authed; email must match)
- [x] Email via Resend (`apps/api/src/lib/email.ts`) — `RESEND_API_KEY` optional in dev; missing key logs the link instead of failing
- [x] Web `/[locale]/dashboard/agency/team` (members list + pending list with Resend / Revoke per row) + `/[locale]/invite/[token]` accept page (3 branches: anonymous signup, signed-in matching email, signed-in mismatch / conflict)
- [x] NextAuth Credentials signIn after new-user accept so dashboard redirect works without re-prompt
- [x] Auth.js middleware allowlist extended to `/invite/<token>`

### 4.D — Public agency + agent profile pages ✅ (`742502a`)

- [x] `publicProfileSchemas` (agency detail / agent detail / paginated card list)
- [x] `/api/public/agencies/:slug` + `/agencies/:slug/properties` + `/agents/:slug` + `/agents/:slug/properties` — hard filters baked in: Agency `isPublic && isActive`, Agent `publicProfileEnabled && isActive` AND owning agency public+active, Property cards `status=ACTIVE && visibility=PUBLIC && deletedAt=null`
- [x] Web `/[locale]/agency/[slug]` + `/[locale]/agent/[slug]` (ISR 300s) with JSON-LD `RealEstateAgent` (with `member` array + `sameAs` socials) and `Person` + `worksFor` respectively
- [x] hreflang same-path alternates + canonical
- [x] Inline first 12 cards; "see all" link to `/search`

### 4.E — TOTP 2FA optional ✅ (`e0b00e5`)

- [x] Pure-Node TOTP (RFC 6238 / SHA-1 / 6 digits / 30 s ± 1 step skew) + AES-256-GCM helpers in `@inmolink/auth` (shared between sign-in flow and api enroll service)
- [x] Recovery codes (8 × xxxx-xxxx-xxxx) Argon2id-hashed; consume-once persistence
- [x] `/api/dashboard/me/two-factor/{enroll,verify,disable}` — verify rate-limited 5/5 min
- [x] Sign-in flow gates on UserSettings.totpEnabledAt — missing code throws `TotpRequired` (`code=totp_required`); page swaps to a 2FA step carrying email + password forward and prompts for code or recovery code
- [x] Web `/[locale]/dashboard/settings/two-factor` — three-state UI (idle → enrolling → saved-with-recovery-codes) + disable panel behind a `<details>` when 2FA is on

### 4.F — Sprint 3 polish carry-overs ✅ (`08b60d9`)

- [x] **Cloudflare Turnstile** verify on lead submit — `TURNSTILE_SECRET` server-side; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` client-side; failed verification returns the same fake-success as honeypot hits so bots can't probe; both env vars optional → dev still works without a Cloudflare account
- [x] **Sitemap regenerate-now** — `/api/dashboard/admin/sitemap/regenerate` (super-admin); coalesced jobId at minute granularity so accidental double-clicks don't queue twice; admin landing tile + Client Component button
- [ ] *(deferred — same as Sprint 3 deferred list)* LocationFAQ admin UI + per-locale slug variants on Location/LocationGroup landing alternates

### Deferred to a follow-up

- [ ] Per-locale slug variants for Location + LocationGroup landing pages (currently same-path) — needs `alternateSlugs` field on the landing API response, mirroring property detail
- [ ] LocationFAQ admin UI (schema + reads exist; admin CRUD UI not built)
- [ ] Two-factor recovery-code regenerate (current flow returns codes once on enroll; user must disable + re-enroll to get a fresh set)
- [ ] User-photo upload widget on `/dashboard/settings/profile` (schema + R2 key field exist; UI defers to existing branding-uploader pattern in a follow-up)

## Sprint 5 — Imports (Kyero priority) ✅ COMPLETE

### 5.A — Kyero streaming SAX connector ✅ (`8e75074`)

- [x] `@inmolink/imports` Kyero adapter with `sax`-based streaming parser (PLAN §11.5 — never buffers full feed)
- [x] AsyncQueue with backpressure (parser pauses when buffer > 50)
- [x] State machine handles locale-keyed `<title>` / `<desc>` / per-feature names; strips `(Province)` suffix; preserves `?v=` cache-buster on image URLs (worker hashes bytes); falls back to `<id>` when `<ref>` empty
- [x] 10 vitest unit tests against `samples/feeds/kyero-sample.xml` — 270 properties + 8,962 image URLs

### 5.B — Resale Online + Generic XML connectors ✅ (`3b6bece`)

- [x] Generic XML engine driven by agency-supplied path → field mappings (same SAX state machine, same backpressure)
- [x] Per-locale text via static `locale` or `localeFromAttr` attribute capture (e.g. `<title language="en">`)
- [x] Resale Online ships as a baked-in preset over the engine (Spain MLS — same agencies that publish Kyero feeds)
- [x] `makeConnector(kind, args)` registry; GENERIC_XML requires fieldMappings
- [x] 3 additional tests: custom-shaped feed via mappings, skip-missing-fields, Resale preset

### 5.C — FeedTypeMap mapping table + matchers + super-admin API ✅ (`831f4b4`)

- [x] Schema: `FeedTypeMap(kind, sourceLabel, propertyTypeId)` unique on `(kind, sourceLabel)`; sourceLabel canonicalised (trim + lower) on every write
- [x] Migration: `20260510125707_sprint_5_feed_type_map`
- [x] Matchers in `@inmolink/imports` (api + worker share): `findPropertyTypeForFeed` (FeedTypeMap → translation fallback → null); `findLocationForTown` (CI city match scoped to country, province tie-breaker, ambiguous flag); `findFeatureIdsByName` (any-locale translation match, dedupe ids, surface unmatched names)
- [x] `/api/dashboard/admin/feed-type-maps` super-admin CRUD; P2002 → 409
- [x] 10 matcher tests with mocked Prisma

### 5.D — Worker import processor + scheduler + image dedup pipeline ✅ (`c4e2ee8`)

- [x] `FEED_IMPORT` BullMQ processor (atomic mutex, FeedRun resolution, AES-256-GCM credential decrypt, connector dispatch via registry)
- [x] `upsertPropertyFromListing`: matches type/location/features; respects `lockedFields` (per-field skip on update; `translations` / `features` / `images` lock the whole replace pass); drops to DRAFT when type/location unmatched on first import
- [x] Image attach pipeline: downloads each URL (25 MB cap), SHA-256 hashes, dedups against MediaObject (refCount-bump on hit; PUT + create on miss), enqueues eager variants matching the dashboard upload flow's jobIds
- [x] FeedRun lifecycle: SUCCESS / PARTIAL (errors but progress) / FAILED (no progress); persists counts + errorsLog
- [x] Worker boot reconciles feed-import schedulers from FeedConnection rows (drift safety net; api keeps them in sync on CRUD)
- [x] Schema additions: `Property.sourceUpdatedAt` + `videoUrl` (migration `20260510130837_sprint_5_property_source_metadata`)

### 5.E — API: FeedConnection CRUD + manual run + run history ✅ (`804c567`)

- [x] `/api/dashboard/imports` (list / detail / create / update / delete) + `/:id/run` + `/:id/runs`
- [x] Visibility: agent sees own; AGENCY_ADMIN sees agency feeds; SUPER_ADMIN sees all
- [x] Credentials write-only on wire — api AES-encrypts before persistence; response surfaces `hasCredentials` boolean
- [x] Schedule sync on every CRUD: `upsertJobScheduler` on create/enable, `removeJobScheduler` on delete/disable
- [x] Manual-run pre-creates `FeedRun(QUEUED)` (dashboard sees pending run immediately) + coalesces double-clicks with per-minute jobId

### 5.F — Web dashboard imports UI + field-level locks ✅ (`d87eae6`)

- [x] `/[locale]/dashboard/imports` list + create + edit (RHF + Zod); per-row ON/OFF toggle; last-run timestamp; error badge
- [x] Run history per connection: color-coded `FeedRunStatus` chips + counts; "Run now" button
- [x] Server Actions for create / update / delete / run / toggleSync
- [x] `FieldLocksManager` on property edit page (non-MANUAL sources only); shared lock keys via `feedImportSchemas.lockableFieldSchema`
- [x] 4-locale `imports` namespace (en/es/de/fr)

### 5.G — Manual XML upload path ✅ (`cb1e220`)

- [x] `POST /api/dashboard/imports/upload-xml` (multipart, 10 MB cap)
- [x] Schema additions: `FeedConnection.uploadedFileKey` (migration `20260510132125_sprint_5_manual_xml_upload`)
- [x] Storage key: `imports/<userId>/<ts>-<filename>`; transient connection with `syncEnabled=false`; feedUrl carries `upload://<filename>` label
- [x] Worker streams from `storage.download(uploadedFileKey)` instead of HTTP fetch when key set
- [x] Mutex relaxed for MANUAL/RETRY triggers (manual-upload connections live with sync permanently off)
- [x] Storage cleanup on connection delete
- [x] `<details>` panel + `ManualUpload` Client Component (`credentials: "include"` posts directly to api)

### 5.H — Type-mapping admin UI ✅

- [x] `/[locale]/dashboard/admin/feed-type-maps` super-admin surface (add form, inline property-type select, delete)
- [x] Admin landing tile

### Deferred to a follow-up

- [ ] Visual builder for GENERIC_XML mappings (current UI accepts pasted JSON)
- [ ] Anomaly detection — pause + alert if a feed run delivers >5× typical volume (PLAN §11.9)
- [ ] Floor plan attach pipeline (image-attach equivalent, uses existing `PropertyFloorPlan` schema)
- [ ] Per-locale feature names propagated through to `Feature` lookup (matcher currently only consults the `en` canonical)

## Sprint 6 — Viewing Requests + Deals + Chat ✅ COMPLETE

### 6.A — Notification schema + migration ✅

- [x] `Notification` model (userId, kind, targetKind/Id, payload, readAt, emailedAt) + indexes
- [x] `NotificationKind` enum (14 kinds spanning viewings, deals, chat, leads, imports)
- [x] Migration `20260510135140_sprint_6_notifications`

### 6.B — ViewingRequest API + workflow ✅

- [x] `viewingRequestSchemas` namespace in `@inmolink/shared`
- [x] AES-256-GCM encrypt/decrypt of clientName/Email/Phone/Notes via `@inmolink/auth`
- [x] State machine: PENDING → ACCEPTED/DECLINED/RESCHEDULED → COMPLETED; CANCELLED/EXPIRED
- [x] expiresAt = now + AgencySettings.viewingResponseDays
- [x] Auto-create VIEWING ChatThread on first accept (idempotent on retry)
- [x] System chat messages on accept/reschedule/outcome via `systemKind`
- [x] Visibility: owner / introducer / SUPER_ADMIN only
- [x] Worker hourly `VIEWING_EXPIRE` scheduler — promotes stale PENDINGs + emits notifications

### 6.C — Deal API (handshake + dispute) ✅

- [x] `dealSchemas` namespace with DealCreate / Confirm / Dispute / Resolve schemas
- [x] BigInt money math (cents) with half-up rounding to avoid float drift
- [x] Snapshot commission% + introducerShare% from AgencySettings on submit (per-deal override allowed)
- [x] Submit auto-confirms submitter side; status flips to PENDING_<otherSide>
- [x] Confirm by other side → CONFIRMED; both notified
- [x] Dispute → DISPUTED + reason; notifies counterparty + all super-admins; AuditLog DEAL_DISPUTED
- [x] Cancel allowed while PENDING_*
- [x] SUPER_ADMIN `/disputes` queue + resolveDispute (CONFIRMED | CANCELLED outcome) with AuditLog

### 6.D — Socket.io on Fastify + Redis adapter ✅

- [x] `socket.io` + `@socket.io/redis-adapter` mounted on `app.server` in onReady hook
- [x] Auth.js v5 cookie-based handshake (mirrors REST `installAuth`)
- [x] `AppIOServer` typed wrapper exposing `SocketData = { user }`
- [x] Per-user room (`user:<id>`) auto-joined on connection — backbone for fanout
- [x] Graceful shutdown closes io + duplicates pub/sub Redis connections

### 6.E — Chat threads + messages API + fanout ✅

- [x] `chatSchemas` namespace + REST: list threads (cursor+unread count), getOrCreate direct,
      list messages (cursor), post message (REST canonical), mark-read
- [x] Socket.io fanout: `chat:message:new` to `thread:<id>` room + `notification:new` to recipient `user:<id>`
- [x] ChatThreadRead per-user pointer auto-bumped on sender's own message + on mark-read

### 6.F — Notification digest worker ✅

- [x] `NOTIFICATION_DIGEST` BullMQ scheduler — hourly tick
- [x] Per-user threshold respects `UserSettings.emailDigestFrequency` (INSTANT/DAILY/WEEKLY)
- [x] Resend send with HTML+text body; soft-fail when RESEND_API_KEY unset (logs body in dev)
- [x] Marks Notification.emailedAt on Resend ack so retries don't dup
- [x] `/api/dashboard/notifications` REST surface (list + unread count + read-all + per-id read)

### 6.G — Web ViewingRequest UI ✅

- [x] `/[locale]/dashboard/viewings` list with role filter (all / owner / introducer)
- [x] `/[locale]/dashboard/viewings/new` form with encrypted client fields + 1-3 preferred dates
- [x] `/[locale]/dashboard/viewings/[id]` detail with property/parties/client/schedule + action panel
- [x] Server Actions: create / accept / decline / reschedule / cancel / setOutcome
- [x] Counterparty info shows WhatsApp link (wa.me) + mailto for client phone/email
- [x] Server-computed `callerActions` drives button visibility (no client-side state-machine guard)

### 6.H — Web Deal UI + super-admin disputes queue ✅

- [x] `/[locale]/dashboard/deals` list + `/new` (RHF-free) + `/[id]` detail with money breakdown
- [x] Server Actions: createDeal / confirm / dispute / cancel / resolveDispute
- [x] `/[locale]/dashboard/admin/disputes` SUPER_ADMIN queue with reason preview + click-through
- [x] Resolve panel (CONFIRMED | CANCELLED outcome + notes; audit-logged)
- [x] Dashboard tile + admin landing tile

### 6.I — Web chat UI + notifications + handoff ✅

- [x] `/[locale]/dashboard/chat` thread list (counterparty, last message preview, unread badge)
- [x] `/[locale]/dashboard/chat/[id]` panel with SSR history + Socket.io live updates +
      auto mark-read on count change
- [x] WhatsApp + mailto handoff on viewing detail (client phone/email fields)
- [x] `/[locale]/dashboard/notifications` inbox with unread filter + mark-all-read
- [x] Bell badge on dashboard home with unread count (soft-fails on api outage)
- [x] 4-locale `viewings`, `deals`, `chat`, `notifications` namespaces

### Deferred to a follow-up

- [ ] "Request a viewing" CTA on public marketplace (`apps/public`) detail — needs a small
      sign-in handoff to `apps/web` since `apps/public` is anonymous
- [ ] Online presence indicator (Socket.io presence room) on chat list
- [ ] Per-agency SMTP for digest (Sprint 8 will rebuild around AgencyEmailConfig)
- [ ] Threads tied to ViewingRequest re-render the request status banner inline (currently links back)
- [ ] User-photo upload widget on `/dashboard/settings/profile` (Sprint 4 carry-over still open)

## Sprint 7 — Billing + plan-gating ✅ COMPLETE

### 7.A — Schema: VAT + billingEmail on Agency ✅

- [x] `Agency.billingEmail` + `vatNumber` + `vatCountryCode` + `taxIdValidated`
- [x] Migration `20260510152523_sprint_7_billing_vat`
- [x] Plan rows already seeded (FREE / PRO with `features` JSON matching PLAN §6)
- [x] `AuditEventType.PLAN_CHANGED / PLAN_GRANTED_MANUALLY / PLAN_REVOKED` exist already

### 7.B — Stripe SDK + ProcessedStripeEvent helpers ✅

- [x] `stripe@^22.1.1` added to `apps/api`
- [x] `apps/api/src/lib/stripe.ts` — memoized client (`apiVersion: "2026-04-22.dahlia"`, 3 retries, 20s timeout)
- [x] `BillingDisabledError` (503 `code: BILLING_DISABLED`)
- [x] `processStripeEvent(event, handler)` — P2002-race collapses dup deliveries
- [x] Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_*`, `STRIPE_TAX_ENABLED` (all optional in dev)

### 7.C — Plan-tier helpers ✅

- [x] `getCurrentPlanTier(agencyId)` honours manual grants + grantedUntil
- [x] `tierHasFeature(tier, feature)` (PRO+ everywhere in v1)
- [x] `requireFeature(request, feature)` throws `PlanRequiredError` (403 PLAN_REQUIRED); SUPER_ADMIN bypasses
- [x] `billingSchemas` exported from `@inmolink/shared`

### 7.D — Billing API ✅

- [x] `GET /api/dashboard/billing/summary` — tier + status + manual-grant + VAT + flags
- [x] `GET /api/dashboard/billing/invoices` — last 50 SubscriptionInvoice rows
- [x] `PATCH /api/dashboard/billing/details` — billingEmail + vatNumber + vatCountryCode
- [x] `POST /api/dashboard/billing/checkout` — Stripe Checkout Session URL (subscription mode + Stripe Tax + tax_id_collection when enabled)
- [x] `POST /api/dashboard/billing/portal` — Customer Portal URL for self-serve changes
- [x] AGENCY_ADMIN-gated; SUPER_ADMIN may pass `?agencyId=`

### 7.E — Stripe webhook receiver ✅

- [x] `POST /api/billing/webhooks/stripe` — raw-body parser scoped to plugin context
- [x] HMAC verify via `stripe.webhooks.constructEvent`
- [x] All work through `processStripeEvent` (idempotent on `stripeEventId`)
- [x] Handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed,finalized,voided}`, `customer.tax_id.{created,updated}`
- [x] Manual grants take precedence over Stripe state
- [x] `tax = total - subtotal` (Stripe v22+ removed top-level `invoice.tax`)
- [x] PLAN_CHANGED audit-log on every Stripe-driven tier flip

### 7.F — Manual grant API + super-admin admin UI ✅

- [x] `GET /api/dashboard/admin/billing/agencies` (cursor + q filter)
- [x] `POST /api/dashboard/admin/billing/grants` (upsert + AuditLog(PLAN_GRANTED_MANUALLY))
- [x] `POST /api/dashboard/admin/billing/grants/revoke` (back to FREE + AuditLog(PLAN_REVOKED))
- [x] Web `/[locale]/dashboard/admin/billing` list + per-row Grant `<details>` + Revoke button
- [x] Admin landing tile

### 7.G — PUBLIC visibility plan gate ✅

- [x] `assertVisibilityAllowed` in property service runs on create + on update only when visibility actually changes
- [x] FREE agencies setting PUBLIC → 403 PLAN_REQUIRED; SUPER_ADMIN bypasses
- [x] Web property form inline hint

### 7.H — Web dashboard billing UI ✅

- [x] `/[locale]/dashboard/billing` — current plan, manual-grant note, period end, invoice table
- [x] `BillingDetailsForm` (`useActionState`) for billingEmail/VAT
- [x] Monthly + yearly EUR upgrade buttons → `startCheckoutAction`
- [x] `Manage` button → `openPortalAction`
- [x] `PlanBadge` shared component
- [x] Bell-tile-style dashboard home tile (AGENCY_ADMIN+SUPER_ADMIN only)

### 7.I — i18n + docs + memory ✅

- [x] 4-locale `billing` namespace (en/es/de/fr)
- [x] CHANGELOG entry
- [x] CHECKLIST sync (this section)
- [x] Memory state updated

### Deferred to a follow-up

- [ ] BUSINESS / ENTERPRISE tier price IDs (env vars exist; UI shows PRO only)
- [ ] Coupon / promotion code admin UI (Stripe `allow_promotion_codes: true` works on the hosted Checkout for now)
- [ ] Per-agency Plan summary card on `/dashboard/agency` (currently only on `/dashboard/billing`)
- [ ] Failed-payment dunning emails (Stripe sends on its own; in-app banner deferred)

## Sprint 8 — Marketing ✅ COMPLETE

### 8.A — Schema additions ✅

- [x] `Contact` model + reverse rel on Agency (migration `20260510170000_sprint_8_marketing`)
- [x] `EmailCampaignRecipient` adds `context Json` + `@@unique(campaignId, email)`
- [x] HMAC tracking-token helpers in `@inmolink/auth` (`signTrackingToken` / `verifyTrackingToken`)

### 8.B — Per-agency SMTP send pipeline ✅

- [x] nodemailer 6.x added to apps/worker + apps/api
- [x] Worker `EMAIL_SEND` processor: pooled per-agency transport, suppression check, merge-tag render, link-rewrite + open-pixel, DKIM signing
- [x] `maybeFinalizeCampaign` flips campaign → SENT when no QUEUED recipients remain (race-safe)

### 8.C — Anonymous tracking endpoints ✅

- [x] `/api/email/o/:tok` — 1×1 GIF + idempotent open stamp
- [x] `/api/email/c/:tok?u=…` — 302 redirect + click stamp
- [x] `/api/email/u/:tok` — confirmation page + EmailSuppression(UNSUBSCRIBE) + Contact.unsubscribedAt

### 8.D — AgencyEmailConfig CRUD + test-send ✅

- [x] `/api/dashboard/marketing/email-config` GET/PUT/DELETE
- [x] AES-256-GCM encrypts smtpPassword + dkimPrivateKey on persist
- [x] `/email-config/test-send` synchronous nodemailer send + persists testStatus/testedAt

### 8.E — AgencyEmailDomain DNS records + verify ✅

- [x] `/api/dashboard/marketing/email-domains` CRUD
- [x] DNS records computed (TXT for VERIFY/SPF/DMARC, CNAME-style DKIM)
- [x] `/email-domains/:id/verify` performs `dns/promises.resolveTxt` + flips per-record statuses
- [x] `/email-domains/dkim/rotate` generates fresh 2048-bit RSA keypair, encrypts private, returns public

### 8.F — EmailTemplate CRUD + merge-tag preview ✅

- [x] `/api/dashboard/marketing/templates` CRUD + `/preview` (server-side render)
- [x] Supported tags: `{{contact.firstName}}` `{{contact.lastName}}` `{{contact.email}}` `{{property.title}}` `{{property.url}}` `{{agency.name}}` `{{unsubscribeUrl}}` `{{trackingPixelUrl}}`
- [x] HTML-escaped substitution in body, raw substitution in subject

### 8.G — EmailCampaign CRUD + schedule + send-now ✅

- [x] `/api/dashboard/marketing/campaigns` CRUD
- [x] `/send-now`: materializes EmailCampaignRecipient (skipDuplicates) + status SENDING + enqueues per-recipient EMAIL_SEND
- [x] `/schedule`: future timestamp; CAMPAIGN_DISPATCHER ticks every 5 min and dispatches due campaigns
- [x] `/cancel`: blocks pending sends + finishedAt
- [x] DRAFT / SCHEDULED / SENDING / SENT / PAUSED / CANCELLED / FAILED state machine

### 8.H — EmailSuppression + Contact CRUD ✅

- [x] `/api/dashboard/marketing/suppressions` list/add/remove
- [x] `/api/dashboard/marketing/contacts` list/add/update/delete/bulk
- [x] Bulk-upsert tx for CSV-style imports (createdAt === updatedAt → "created" count)

### 8.I — FeaturedListing super-admin + public ✅

- [x] `/api/dashboard/admin/featured-listings` CRUD (super-admin)
- [x] Plan-tier gate on owning agency (PRO+ via `tierHasFeature("feature:featured.listings")`)
- [x] `/api/public/featured-listings` anonymous, position-ordered, active-window-only
- [x] Public marketplace homepage renders 3-col grid above the search CTA

### 8.J — Web dashboard pages ✅

- [x] `/[locale]/dashboard/marketing` landing
- [x] `.../marketing/templates` list + create form + delete
- [x] `.../marketing/campaigns` list + create form (RHF-free) + send-now / cancel / delete
- [x] `.../marketing/contacts` list + filter + create + delete
- [x] `.../marketing/suppressions` list + manual-add + remove
- [x] `.../agency/email-config` SMTP form + test-send + DKIM rotate
- [x] `.../admin/featured-listings` curation with surface filter + create + delete
- [x] Dashboard home tile + admin landing tile

### 8.K — Worker scheduler + i18n + docs ✅

- [x] CAMPAIGN_DISPATCHER queue + 5-min scheduler in apps/worker
- [x] EMAIL_SEND queue producer in apps/api (one job per recipient)
- [x] Worker config adds `API_BASE_URL` for tracking link prefix
- [x] 4-locale `marketing` namespace
- [x] CHANGELOG entry, CHECKLIST sync, memory state updated

### Deferred to a follow-up

- [ ] Webhook ingestion for SMTP relay bounces (e.g. Postmark/Mailgun callbacks) — currently bounces only flag via SMTP-level errors; soft bounces aren't separated from hard
- [ ] Open-tracking deduplication beyond the per-recipient `openedAt is null` guard (e.g. stripping image-cache prefetches from Apple Mail Privacy)
- [ ] Visual template editor (current UI accepts pasted HTML)
- [ ] Per-recipient drilldown UI on the campaign detail page
- [ ] FeaturedListing reorder UI (current admin lists by createdAt; position-only edits)
- [ ] CSV upload form for bulk Contact import (api endpoint exists; UI defers)
- [ ] List-Unsubscribe-Post one-click flow (`mailto:` + `https://`) — header is set; gating for one-click endpoint deferred
- [ ] Per-locale email templates (current single template per agency)

## Sprint 9 — Tickets + Audit log ✅ COMPLETE

### 9.A — Audit log helpers + wiring ✅

- [x] `apps/api/src/lib/audit.ts` — `writeAuditLog` + `writeAuditLogTx` (capture IP/UA, soft-fail)
- [x] PASSWORD_CHANGED on `/me/password` PATCH
- [x] TOTP_ENABLED / TOTP_DISABLED on two-factor verify/disable
- [x] PROPERTY_DELETED on soft-delete route
- [x] SUPER_ADMIN_BULK_OPERATION on ticket assign

### 9.B — Tickets API ✅

- [x] `/api/dashboard/tickets` list (cursor + filters) / detail / create / reply / assign / status
- [x] Visibility per role (AGENT own / AGENCY_ADMIN agency / SUPER_ADMIN all)
- [x] Server-computed `callerActions` (canReply / canAssign / canChangeStatus / canSeeInternal)
- [x] Internal notes filtered for non-super-admin readers
- [x] Auto state transitions (RESOLVED→IN_PROGRESS on customer reply; OPEN→IN_PROGRESS on first super-admin reply)
- [x] `assignedToId` restricted to SUPER_ADMIN role

### 9.C — Ticket attachments via R2 ✅

- [x] Reuse `/api/uploads/sign` + `/api/uploads/register` pipeline
- [x] `TicketMessage.attachments` JSON `{mediaObjectId, name, size, mimeType, r2Key}`
- [x] `refCount++` + clear `scheduledDeleteAt` in same tx as message create
- [x] Hydrate URLs via `storage.publicUrl(r2Key)` on read
- [ ] *(deferred)* UI uploader widget for tickets — schema + api ready; reuse `ImageUploader` shape

### 9.D — Audit log viewer ✅

- [x] `/api/dashboard/admin/audit-log` cursor-paginated (super-admin only)
- [x] Filters: type / actor email / agencyId / targetKind / fromDate / toDate
- [x] Web `/[locale]/dashboard/admin/audit-log` table view + filter form
- [x] Admin landing tile

### 9.E — Web tickets UI ✅

- [x] `/[locale]/dashboard/tickets` list (status filter + subject search + cursor)
- [x] `/[locale]/dashboard/tickets/new` form (subject + category + priority + body)
- [x] `/[locale]/dashboard/tickets/[id]` thread (status/priority badges + status-button row + reply form + isInternal toggle for super-admin + attachment links)
- [x] Same `/dashboard/tickets` page used as super-admin queue (visibility logic in service yields the right scope)
- [x] Dashboard home tile + admin landing tile

### 9.F — i18n + docs ✅

- [x] 4-locale `tickets` + `audit` namespaces (en/es/de/fr)
- [x] CHANGELOG entry
- [x] CHECKLIST sync (this section)
- [x] Memory state

### Deferred to a follow-up

- [ ] Ticket attachment UI uploader (schema + api support shipped; reuse the `ImageUploader` shape)
- [ ] Audit-log expand-row to show full `metadata` JSON (currently truncated at 120 chars)
- [ ] Audit-log CSV export for super-admin review
- [ ] Saved-filter chips on the audit-log page (presets like "Last 24h plan changes", "Failed login burst")
- [ ] Email notifications on ticket reply (Sprint 8 marketing infra is ready; needs a transactional template)
- [ ] AGENCY_CREATED / ROLE_CHANGED audit hook on invite-accept (not yet wired; existing flow doesn't write the event)
- [ ] IMPORT_CREDENTIALS_UPDATED hook on import CRUD (service signature refactor needed to plumb request)

## Sprint 10 — Webhooks (out) ✅ COMPLETE

### 10.A — Schemas + emit helper + endpoint CRUD ✅

- [x] `webhookSchemas` namespace in `@inmolink/shared`
- [x] `apps/api/src/lib/webhooks.ts` — `emitWebhookEvent(tx, args)` + `emitWebhookEventStandalone`
- [x] `/api/dashboard/agency/webhooks` CRUD; secret AES-256-GCM-encrypted; plaintext returned once on create only
- [x] `/api/dashboard/agency/webhooks/:id/test` enqueues a synthetic event for that endpoint

### 10.B — Event emission hooks ✅

- [x] PROPERTY_CREATED / UPDATED / DELETED in `properties/repository.ts`
- [x] LEAD_CREATED in `public/lead-routes.ts`
- [x] VIEWING_REQUESTED / ACCEPTED / DECLINED / COMPLETED in `viewings/service.ts`
- [x] DEAL_CONFIRMED / DEAL_DISPUTED in `deals/service.ts`
- [ ] *(deferred)* AGENT_INVITED / AGENT_JOINED / IMPORT_RUN_COMPLETED / IMPORT_RUN_FAILED / CHAT_MESSAGE_RECEIVED — each requires a service-level tx refactor; defer to v1.5 follow-up
- [ ] *(deferred)* Introducer-agency-side delivery (currently only listing-agency emits — needs dedup to avoid double-firing if both subscribe)

### 10.C — Worker delivery + retry/DLQ ✅

- [x] `apps/worker/src/processors/webhook-deliver/processor.ts` — HMAC-SHA256 sign + POST + persist attempt
- [x] `inmolink-signature: t=<unix>,v1=<hex>` header format
- [x] Custom headers: `inmolink-event-id`, `inmolink-event-type`, `inmolink-delivery-id`
- [x] 10s `AbortController` timeout; 4xx (non-408/429) → permanent failure; otherwise retry ladder
- [x] Retry ladder: 1m → 5m → 30m → 2h → 12h → DEAD_LETTERED
- [x] WEBHOOK_DISPATCHER scheduler ticks every 30s; deterministic jobId prevents double-enqueue
- [x] Wired into worker.ts; queue close on graceful shutdown

### 10.D — Super-admin viewer + replay ✅

- [x] `/api/dashboard/admin/webhook-deliveries` cursor-paginated list with filters (super-admin)
- [x] `/:id` detail returns payload + attempt history
- [x] `POST /:id/replay` resets to PENDING + nextAttemptAt=now; AuditLog(WEBHOOK_REPLAYED)

### 10.E — Web dashboard pages ✅

- [x] `/[locale]/dashboard/agency/webhooks` — list + create form + Test/Delete per row
- [x] Secret-revealed-once UX on create (emerald copy panel)
- [x] `/[locale]/dashboard/admin/webhook-deliveries` list + filters + detail + Replay button
- [x] Agency landing tile + admin landing tile

### 10.F — i18n + docs ✅

- [x] 4-locale `webhooks` namespace (en/es/de/fr)
- [x] CHANGELOG entry
- [x] CHECKLIST sync
- [x] Memory state

### Deferred to a follow-up

- [ ] AGENT_INVITED / AGENT_JOINED / IMPORT_RUN_COMPLETED / IMPORT_RUN_FAILED / CHAT_MESSAGE_RECEIVED emission hooks — schema enum value exists; each requires a service-level transaction refactor
- [ ] Introducer-agency-side webhook fanout for VIEWING_* and DEAL_* (currently only listing-agency)
- [ ] Endpoint pause/resume button (delete + recreate works for v1)
- [ ] Per-event delivery rate-limit (e.g. cap 100/min per endpoint to protect slow consumers)
- [ ] Webhook signature spec doc page on the dashboard (HMAC verification example in 3 languages)
- [ ] Super-admin delivery list ordering by event.createdAt instead of delivery PK (current uses `id desc` — ID is cuid so it's monotonic-ish but not strictly chronological under high concurrency)

## Sprint 11 — Export ✅ COMPLETE

### 11.A — Export schemas + plan-gated CRUD ✅

- [x] `exportSchemas` namespace (kind/status/filters + refinements)
- [x] `/api/dashboard/exports` list/detail/create/delete
- [x] Plan-gating: CSV → `feature:export.csv`; PDF kinds → `feature:export.pdf`
- [x] Create writes Export(QUEUED) + 7-day `expiresAt` + enqueues `EXPORT_GENERATE`

### 11.B — Worker EXPORT_GENERATE + CSV + PDF templates ✅

- [x] `makeExportGenerateProcessor` resolves filters → properties (agency-scoped)
- [x] CSV renderer (RFC 4180, 16 columns, locale-aware)
- [x] PDF templates: brochure (single property) + portfolio (cover + per-page)
- [x] Uploads to `exports/<agencyId>/<exportId>.<ext>`
- [x] Marks SUCCESS / FAILED with errorMessage

### 11.C — Authenticated download proxy + 7-day expiry cleanup ✅

- [x] `/api/dashboard/exports/:id/download` streams after auth + status + expiry checks (410 on stale)
- [x] `EXPORT_CLEANUP` daily scheduler (03:30 UTC) deletes expired rows + R2 blobs

### 11.D — Web /exports list + create + download ✅

- [x] List page with status badges + size + expiry countdown + Download / Delete
- [x] Create form (kind selector + propertyIds OR filters; PDF_PROPERTY requires one ID)
- [x] Dashboard home tile (any role with an agency)

### 11.E — i18n + docs ✅

- [x] 4-locale `exports` namespace (en/es/de/fr)
- [x] CHANGELOG entry, CHECKLIST sync, memory state

### Deferred to a follow-up

- [ ] Native R2-presigned download URLs (current: api-proxied stream — works for all backends but doubles bandwidth on R2)
- [ ] Per-language PDF templates (current: locale variable threads through; the body strings are EN — switch to next-intl messages in templates)
- [ ] PDF style tweaks (logo embed, agency colors from `Agency.brandingPrimaryColor`, footer with agency contact)
- [ ] Streaming CSV for very large exports (current: builds full string in memory; cap is 500 properties)
- [ ] Async-status polling on the dashboard (current: page refresh; could subscribe to a Notification on SUCCESS / FAILED)
- [ ] Export from filter URL — open the property list `/dashboard/properties?status=ACTIVE&q=…` and click "Export this view" to pre-fill the create form

## Sprint 12 — Pressure test + launch prep ✅ COMPLETE

### 12.A — Synthetic seed script ✅

- [x] `apps/worker/scripts/seed-bulk.ts` with `--agencies / --properties / --country` flags
- [x] Idempotent on re-run via `synthetic-` prefix
- [x] `pnpm --filter @inmolink/worker seed:bulk` script entry

### 12.B — k6 baselines ✅

- [x] `tools/k6/public.js` — 50 VUs, p(95)<500ms threshold, weighted iteration mix
- [x] `tools/k6/dashboard.js` — 20 VUs, p(95)<300ms threshold, Auth.js v5 cookie capture in setup()
- [x] `tools/k6/README.md` with bench-environment setup + failure-mode notes

### 12.C — Postgres tuning + pg_stat_statements ✅

- [x] `infra/postgres/postgresql.conf.tuned` for 16GB / 8-vCPU baseline
- [x] `tools/sql/health-queries.sql` with 9 incident-response queries
- [x] ADR 0004 — postgres-tuning-baseline.md

### 12.D — Health endpoint + monitoring runbook ✅

- [x] `/api/health/ready` probes Postgres in parallel with Redis
- [x] `docs/runbooks/monitoring.md` — endpoint checklist, Better Stack heartbeats, alert routing, log shipping, cheat-sheet

### 12.E — DR runbook ✅

- [x] `docs/runbooks/disaster-recovery.md` — backup matrix + 3 restore drills (full / PITR / R2 versions) + quarterly drill checklist

### 12.F — GDPR pages + consent banner ✅

- [x] `/[locale]/{privacy,terms,cookies}` Server Components
- [x] `CookieConsentBanner` Client Component with localStorage + cookie persistence
- [x] `PublicFooter` shared component linking the legal pages
- [x] Wired into `apps/public/app/[locale]/layout.tsx`

### 12.G — Sitemap + robots validator ✅

- [x] `scripts/validate-sitemap.ts` — robots → sitemap → child sitemaps → property URLs + hreflang
- [x] `docs/runbooks/seo-checklist.md` with manual + Schema.org cheat-sheet

### 12.H — VPS deploy runbook + production env example ✅

- [x] `docs/runbooks/deploy.md` covering server provisioning + stack install + app deploy + rollback
- [x] `.env.example.production` annotated env-var reference

### 12.I — i18n + docs + commit + push ✅

- [x] `legal` + `consent` i18n namespaces (en/es/de/fr)
- [x] CHANGELOG entry, CHECKLIST sync (this section), memory state
- [x] Two commits + push

**v1 BUILD COMPLETE.** All 12 sprints shipped. Outstanding items now live as v1.5 deferred follow-ups in the per-sprint sections above.

### Deferred to a follow-up (Sprint 12 specifically)

- [ ] Better Stack heartbeat ping per worker scheduler (env vars documented; scheduler `tick` doesn't yet POST after success)
- [ ] CI workflow `.github/workflows/deploy.yml` — runbook describes the steps; the YAML lands as ADR 0005
- [ ] Run an actual 15M-property bench against staging (the seed script supports it; needs a sized VPS)
- [ ] Quarterly DR drill scheduled in calendar
- [ ] Legal copy review on privacy / terms / cookies (placeholder marked in-page)
- [ ] PgBouncer wiring for the Phase 2 trigger (>200 concurrent connections) — separate ADR

---

## Cross-cutting / always-on

- [ ] Context7 MCP installed (currently using training-data knowledge; user flagged) — see TROUBLESHOOTING when added
- [ ] CHANGELOG appended on every notable change
- [ ] TROUBLESHOOTING entry per real bug we hit + fix
- [ ] ADR per architectural decision

---

## Deferred to v1.5

- Webhook event catalog (carry-over option from PLAN §11.10 risk)
- Featured listings UI polish
- PDF Export (CSV ships in v1; PDF deferred if behind)
- Custom email domain DKIM (use platform Resend in v1 if behind)
- Audit log full coverage (start with login events only)
- pHash near-duplicate detection
- AI lead qualification
- Buyer accounts on public marketplace
- HLS video streaming
