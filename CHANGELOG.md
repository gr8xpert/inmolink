# Changelog

All notable changes to Inmolink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version `0.0.0` covers the planning phase (no shipped code yet). Sprint 1 will produce the first tagged release.

---

## [Unreleased]

### Added (Sprint 1 — slice G.1, public marketplace property detail)

- **Public api routes** at `/api/public/*` (anonymous, no `requireUser()`):
  - `GET /api/public/properties/:id?locale=` — detail. Hard-filtered to `visibility=PUBLIC + status=ACTIVE + deletedAt=NULL` (PLAN §1 row 5). Sensitive fields stripped: no `addressLine`, `postcode`, `ownerUserId`, `ownerAgencyId`. Agency badge data (`{id, slug, name, logoUrl}`) denormalised into the response so the page renders without a join request. 404 throws via `app.httpErrors.notFound` (consistent with the rest of the api).
  - `GET /api/public/properties/:id/images` — same visibility check on the parent so an image-list scrape can't leak from `PRIVATE`/`SHARED` rows even with a known id. Tighter rate limit than dashboard (120/min/IP).
- **`publicPropertySchemas`** in `@inmolink/shared` — public DTO + agency-badge embed + image schema. `PropertyStatus` enum widened to mirror the actual Prisma enum (`UNDER_OFFER`, `RENTED` were missing from the dashboard schema — separate hardening for the dashboard schema deferred).
- **`/[locale]/property/[slugId]` Server Component** in `apps/public`:
  - URL shape `<slug>-<id>`. Parser accepts both `slug-id` and bare-`id` forms; if the slug part doesn't match the canonical translation slug, **permanent-redirects** (301) to the canonical URL.
  - Per PLAN: missing / non-PUBLIC / deleted properties **301 home**, never 404 — preserves SEO equity Google has crawled.
  - **`export const revalidate = 300`** — Next.js ISR; matches PLAN §11.4 stale-while-revalidate budget.
  - **JSON-LD `RealEstateListing`** inline `<script>` per schema.org — title / description / images / `Offer` (price + currency + agent) / `numberOfRooms` / `floorSize`.
  - **`generateMetadata`** — title, description (meta or first 160 chars of body), canonical, OpenGraph (with cover image), Twitter `summary_large_image` card.
  - `<AgencyBadge size="md">` from `@inmolink/ui` in the header.
  - Hero img `fetchpriority="high"`; gallery imgs `loading="lazy"`.
- **`apps/public/src/lib/api.ts`** — anonymous `publicApiFetch<T>` (no cookie forwarding) with Next.js `next: { revalidate, tags }` integration. Default 300s revalidation. Typed `ApiError`.
- **`apps/public/src/lib/format.ts`** — locale-aware money + date (mirror of the web helper).

### Added (Sprint 1 — slice F.3.b, edit form + image management)

- **`/[locale]/dashboard/properties/[id]/edit`** — Server Component shell prefetches detail + types + locations in parallel, renders the unified `PropertyForm` in `mode="edit"` with `initial` prefill. Non-owners are redirected back to the detail page (defense-in-depth — the api enforces the same check). New `updatePropertyAction` (PATCH) lives in `[id]/edit/actions.ts`; redirects to detail on success, returns typed error on failure.
- **`PropertyForm` consolidated** — moved from `new/property-form.tsx` to `_components/property-form.tsx` with a discriminated `mode: "create" | "edit"` prop. Edit mode pre-fills from `PropertyDetail` (price major-units derived from cents, all 4 locale tabs prefilled from `translations[]`, falls back to first picker option for missing IDs). On submit, edit mode validates against `propertyUpdateSchema` (partial-friendly) and POSTs to `updatePropertyAction`; create mode keeps validating against `propertyCreateSchema`.
- **`ImageManager` Client Component** on the detail page (owner-only) — replaces the read-only gallery for owners with a per-image card: alt-text input (saves on blur), Set-as-cover button (api unsets old cover in same tx), up/down reorder arrows, Delete (with confirm). Non-owners still see the read-only gallery thumbnail grid.
- **Reorder semantics** — `swapImagePositionsAction` issues two parallel PATCHes that swap positions with the neighbor. Temporary collision is harmless because the api orders by `(position ASC, createdAt ASC)`. Single `revalidatePath` at the end batches the refresh.
- **3 new Server Actions** in detail page `actions.ts` — `patchImageAction`, `deleteImageAction`, `swapImagePositionsAction`. Internal `call()` helper now accepts a `RequestInit` so non-POST verbs work.
- **Detail page header** gets an "Edit" CTA visible only to owners — links to the new edit page.
- **`edit` i18n key** added in all 4 locales.

### Added (Sprint 1 — slice F.3.a, image upload widget)

- **`ImageUploader` Client Component** (`apps/web/app/[locale]/dashboard/properties/[id]/image-uploader.tsx`) — drag-and-drop / file-picker upload widget that drives the full pipeline:
  1. SHA-256 each file via Web Crypto (`crypto.subtle.digest`)
  2. Detect dimensions via `createImageBitmap` (best-effort — some HEIC files can't decode in-browser, in which case width/height go null)
  3. POST `/api/uploads/sign` (server action wrapper)
  4. PUT each novel file directly to the storage backend (R2 in prod, dev `/api/_local-storage/upload` HMAC route in dev) — the auth cookie does not travel with this request
  5. POST `/api/uploads/register` so the api re-hashes + creates `MediaObject`
  6. POST `/api/dashboard/properties/:id/images` to attach (slice E)
- **Per-file status surfacing** — Queued / Hashing / Signing / Uploading / Registering / Attaching / Done / Error — so partial failures are visible. UI caps: 25 MB per file, 20 files per batch (api caps stay 500 MB / 50).
- **3 new Server Actions** in `app/[locale]/dashboard/properties/[id]/actions.ts` (`signUploadsAction`, `registerUploadsAction`, `attachImagesAction`). Routing all api calls through Server Actions keeps cookie forwarding in `apiFetch` uniform; the api's CORS allowlist doesn't have to grow with every new browser-side caller. `attachImagesAction` calls `revalidatePath` on the detail page so the gallery refreshes; `router.refresh()` on the client side complements that for the in-flight session.
- **Detail page renders the uploader for owners only** — same matrix as the api's ownership service: SUPER_ADMIN, AGENCY_ADMIN of owning agency, AGENT owner. Computed from the session vs `property.ownerUserId` / `ownerAgencyId`.
- **`uploadImages` i18n key** added in all 4 locales.

### Added (Sprint 1 — slice F.2, property create form)

- **`/[locale]/dashboard/properties/new`** — full create form. Server Component shell prefetches the type + location pickers in parallel; `PropertyCreateForm` Client Component handles the rest (RHF + Zod resolver, `react-hook-form@^7.54` and `@hookform/resolvers@^3.9`).
- **Locale tabs** for translations: `en` required, `es/de/fr` optional and dropped from the payload if title+description are blank. Slug auto-derives from title via a Unicode-property slugify (`\p{M}` strips combining diacritics so "Málaga" → "malaga"); user can override.
- **Server Action `createPropertyAction`** posts to `/api/dashboard/properties` via `apiFetch` (cookie forwarding works through Server Actions same as Server Components). Returns typed `CreatePropertyResult` so the form can surface inline errors; on success, redirects server-side to the new property's detail page.
- **Form-level Zod** is intentionally permissive (numeric fields are strings the user types) — values are massaged to `propertyCreateSchema` shape on submit, then re-validated against the canonical schema before sending. Catches edge cases (cents overflow, malformed slug) without fighting RHF over blank fields.
- **`GET /api/dashboard/property-types` + `GET /api/dashboard/locations`** in the new `taxonomy` module. Read-only, locale-aware (`?locale=` falls back to en, then first translation). New `taxonomySchemas` namespace in `@inmolink/shared`.
- **Seed extension** — 1 PropertyTypeGroup ("Residential") + 5 PropertyTypes (Apartment, House, Villa, Plot, Commercial) + 1 Country (Spain) + 3 Cities (Málaga, Madrid, Barcelona), each with all 4 locale translations. Stable explicit ids → idempotent re-seed. Sufficient to use the create form end-to-end without Sprint 2's super-admin curation UI.
- **`.input` Tailwind component class** in `apps/web/app/globals.css` — neutral input styling reused across the form's inputs, selects, and textareas. Avoids pulling in shadcn primitives this slice.
- **`createNew` i18n key** added in all 4 locales; list page now has a "New property" CTA.

### Added (Sprint 1 — slice F.1, dashboard property read-only path)

- **`/[locale]/dashboard/properties` list page** — Server Component, calls the api via the new `apiFetch` helper that forwards the request `cookie` header (so Auth.js v5 session is shared between web origin and api origin). Cursor-paginated. Status chip per row, locale-aware money + date, transaction-type / bed / bath / m² metadata.
- **`/[locale]/dashboard/properties/[id]` detail page** — fetches detail + image list in parallel. Picks the best translation (requested locale → en → first available). Renders cover + gallery, key facts grid (price, status, visibility, bed/bath/area/plot/yearBuilt), and description block. Variant URLs land in slice G; for now we render the source MediaObject directly.
- **`apps/web/src/lib/api.ts`** — typed fetch with `ApiError` class. Reads cookies from `next/headers`, base URL from `NEXT_PUBLIC_API_URL`, `cache: "no-store"` for now (revalidation tags arrive later).
- **`apps/web/src/lib/format.ts`** — locale-aware money + date formatters (`Intl.NumberFormat` / `Intl.DateTimeFormat`); maps the project's 2-letter locale codes to BCP-47 tags.
- **`<AgencyBadge>` in `@inmolink/ui`** — shared, mandatory badge (PLAN §1 row 4) for cards / detail / exports / emails. Server-Component-safe pure JSX with `cn` + Tailwind. Two sizes: `sm` (cards) / `md` (detail headers).
- **`GET /api/dashboard/properties/:id/images`** added to slice E's images module — listed by position; same read scope as property detail (PRIVATE only to owner / agency_admin / super_admin). New `propertyImageSchemas.listPropertyImagesResponseSchema`.
- **i18n**: `properties` namespace populated in en/es/de/fr message files (status / visibility / transaction enums + page strings). Dashboard home now links to `/properties`.

### Added (Sprint 1 — slice E, property-image attach + media cleanup)

- **Property-image attach API** under `/api/dashboard/properties/:id/images`:
  - `POST` — bulk attach 1–50 MediaObjects (validates each is an `image/*` MIME, rejects unknown ids). One transaction per request: creates `PropertyImage` rows + bumps `MediaObject.refCount` + clears the 24h orphan-grace `scheduledDeleteAt`. Cover-uniqueness enforced (only one `isCover=true` per property; old cover gets unset in the same tx).
  - `PATCH /:imageId` — alt text, position, isCover.
  - `DELETE /:imageId` — drops the row + decrements refCount; if it hits 0 the service sets `scheduledDeleteAt = NOW() + 7d` for the cleanup worker.
  - All endpoints require ownership: SUPER_ADMIN, AGENCY_ADMIN of the owning agency, or the AGENT owner. Same matrix as the existing property endpoints.
- **`MEDIA_CLEANUP` worker** (`apps/worker/src/processors/media-cleanup`) — dedicated processor + repeatable scheduler. Runs daily at 03:00:00 via `Queue.upsertJobScheduler('media-cleanup-daily', { pattern: '0 0 3 * * *' }, ...)` (BullMQ 6-field cron, seconds first). Idempotent — every worker boot re-upserts the same scheduler id, so adding pods needs no ops step.
  - Pass 1 — MediaObject orphans (`refCount<=0` + `scheduledDeleteAt<=NOW()`): decrements refCount on every variant whose source points here (when a variant drops to 0, schedule its own delete = NOW()+7d), deletes the source R2 blob, then deletes the row. Variant rows survive parent deletion thanks to the FK SetNull.
  - Pass 2 — MediaVariant orphans (same WHERE): deletes the variant blob, then the row.
  - Storage delete failures are logged but don't block DB GC. Batch size capped at 500 rows/pass to bound a single tick's runtime.
- **Shared `propertyImageSchemas`** in `@inmolink/shared` — `attachPropertyImagesRequestSchema` (max 50 per call), `patchPropertyImageRequestSchema` (with `refine` for "at least one field"), `propertyImageSchema` DTO + response wrappers.

### Changed (Sprint 1 — slice E, schema)

- **Migration `20260509201152_slice_e_media_orphan_tracking`**:
  - `MediaObject.refCount` default `1` → `0` (fix P1-3 from review — service inserts at 0, schema must match).
  - `MediaVariant.sourceMediaObjectId` made nullable; FK `onDelete: Cascade` → `SetNull`. Variants are globally dedup'd by output hash (refCount tracks references); a source dying doesn't invalidate the variant blob if other sources still reference it.
  - `MediaVariant.scheduledDeleteAt DateTime?` added with index for the cleanup worker scan.

### Added (Sprint 1 — slice D, image variant pipeline)

- **`apps/worker` IMAGE_VARIANT processor** — sharp pipeline at 4 sizes (thumb 200 / small 480 / medium 1080 / large 1920) with `fit: inside` + `withoutEnlargement` (no upscaling, aspect-ratio preserved). Per PLAN §5: WebP-only at all sizes, plus a JPEG fallback at large for the cover image's `og:image`. Encoder settings frozen at WebP q=82 effort=4 / JPEG q=85 mozjpeg; bumping any of these requires bumping `mediaSchemas.PIPELINE_VERSION`. (`apps/worker/src/processors/image-variant/{pipeline,processor}.ts`)
- **Content-addressable variant dedup** — variant output is SHA-256-hashed and `MediaVariant.hash` is UNIQUE. Same-source dedup (skip if (source × size × format × version) already exists) + cross-source dedup (two MediaObjects producing byte-identical variants share one row, refCount tracks references). P2002 race collapses to refCount bump. (`apps/worker/src/processors/image-variant/processor.ts`)
- **Storage `download(key)` and `put(key, body, contentType)`** — added to `Storage` interface for direct worker use. R2 implements via `GetObjectCommand` (full-buffer) / `PutObjectCommand` (with `ContentLength`). LocalFs delegates to existing `readFile`/`writeFile`. Variant keys live under a `variants/` prefix (separate from source `media/`) so the orphan-cleanup worker can scan each independently. New `variantKeyFromHash()` exported. (`packages/storage/src/{interface,r2,local-fs,index}.ts`)
- **Shared variant contract** — `packages/shared/src/schemas/media.ts` exposes `VARIANT_SIZES`, `EAGER_VARIANTS`, `PIPELINE_VERSION = 1`, `imageVariantJobSchema` (Zod), and `imageVariantJobId()` for deterministic BullMQ dedup ids (`iv:<sourceHash>:<size>:<format>:v<n>`). Re-exported from `@inmolink/shared` as `mediaSchemas`.
- **API queue producer** — `apps/api/src/lib/queues.ts` builds the `image-variant` Queue against the shared Redis connection with sane defaults (`attempts: 5`, exponential backoff at 5s, `removeOnComplete: { age: 3600 }`, `removeOnFail: { count: 200 }`). `enqueueEagerImageVariants()` enqueues the **eager set (thumb + medium WebP)** after `MediaObject.create` in `/uploads/register`; non-image MIME types are skipped. Queues drained on `app.close()`.
- **Lazy variant resolver** — `apps/api/src/modules/uploads/variants.ts` exports `resolveOrEnqueueVariant({mediaObjectId, sizeName, format})` returning either `{ status: 'ready', publicUrl, ... }` or `{ status: 'pending' }`. Public marketplace will call this for **small / large / cover-JPEG**, falling back to medium while pending. Slice G wires the route.
- **Worker storage wiring** — mirrors `apps/api/src/storage.ts`. Worker reads/writes the same dev volume as the api in local-fs mode. New env vars `LOCAL_STORAGE_ROOT_DIR` + `LOCAL_STORAGE_PUBLIC_BASE_URL` on `apps/worker/.env(.example)`.
- **New deps**: `bullmq` added to `apps/api`; `@inmolink/storage` + `@prisma/client` added to `apps/worker`.

### Security (Sprint 1 — post-review hardening)

- **Open-redirect on `/sign-in`** — `callbackUrl` is now validated to be a same-origin path (`/...`, not `//...` or absolute). Previously `?callbackUrl=https://evil.com` would redirect post-login. (`apps/web/app/[locale]/sign-in/page.tsx`)
- **R2 presigned PUT now binds `content-type`** — added `signableHeaders: new Set(["content-type"])` so the browser cannot upload a different MIME than the URL was issued for. Prevents a malicious client from storing `.exe` against an `image/jpeg`-signed URL. (`packages/storage/src/r2.ts`)
- **`ENCRYPTION_KEY` validated as 64-char lowercase hex (32 bytes)** — was 32 chars (UTF-8 multi-byte chars produced wrong key length for AES-256-GCM). Both `apps/api/src/config.ts` and `apps/worker/src/config.ts`. `.env.example` files updated; existing dev `.env` keys regenerated to a 64-char hex value. Decryption code (forthcoming) must use `Buffer.from(key, "hex")`.

### Changed

- **`/uploads/register` collapses TOCTOU window** — dropped the separate `storage.exists()` precheck; `fetchAndHash()` now throws a typed `StorageObjectMissingError` on missing-key (R2 `NotFound`/`NoSuchKey`/HTTP 404, LocalFs `ENOENT`), which the service maps to `UploadMissingError` (404). Removes the gap where the orphan-cleanup worker could delete the object between `exists` and `fetchAndHash`, and avoids two storage round-trips. (`packages/storage/src/{interface,r2,local-fs}.ts`, `apps/api/src/modules/uploads/service.ts`)

### Added (Sprint 0 — Step 3 monorepo scaffold)

- **Root configs**: `package.json` (workspace root, turbo-delegated scripts, pinned pnpm@10.33.2, Node ≥20), `pnpm-workspace.yaml`, `turbo.json` (Turbo 2 syntax with proper `dependsOn` graph), `tsconfig.base.json` (strict + verbatim module syntax + noUncheckedIndexedAccess), `biome.json` (replaces ESLint+Prettier per ADR 0001), `.gitattributes` (LF normalization), `.editorconfig`, `.nvmrc`, `.npmrc` (pnpm tuning).
- **`apps/web`** — Next.js 15 dashboard scaffold. App Router, locale-prefixed routing via next-intl (4 locales), Tailwind + shadcn-ready, port 3000.
- **`apps/public`** — Next.js 15 marketplace scaffold. ISR-aggressive (`Cache-Control: s-maxage=300, stale-while-revalidate=600` on property/buy routes per PLAN §11.4), `robots.ts` allows public, port 3002.
- **`apps/api`** — Fastify 5 with Zod type provider. Helmet, CORS, Redis-backed rate limiter, multipart, sensible, swagger + swagger-ui at `/docs`. Pino logger with PII redaction. Health routes `/api/health/{live,ready}`. Graceful shutdown drains Redis. Port 3001.
- **`apps/worker`** — BullMQ workers across 8 named queues with priority tiers per PLAN §11.7 (high: email/webhook/chat-fanout; medium: imports/exports; low: variants/reindex/media-cleanup). Concurrency caps per queue.
- **`packages/db`** — Prisma client singleton + full schema (~50 models, ~25 enums) + dev seed (FREE + PRO plans + super-admin agency-of-one). Schema validates clean; client generates via `pnpm db:generate`.
- **`packages/shared`** — Zod re-export + locked `LOCALES`, `USER_ROLES`, `PAID_FEATURES`, `PLAN_TIERS` constants used everywhere.
- **`packages/auth`** — Auth.js v5 + Prisma adapter wiring stub. `can(subject, action, resource)` permission matrix. Argon2id password hash/verify (@node-rs/argon2 per ADR 0001 §11.9). `PlanRequiredError` thrown by middleware on 403.
- **`packages/search`** — `SearchAdapter` interface + `MeilisearchAdapter` with per-locale indices, faceted search, `_geoRadius` support, ping for `/ready`. Swap-ready per ADR 0001.
- **`packages/ai`** — Anthropic SDK wired with Claude Haiku as default. `suggestIcon()` stub for Sprint 2 super-admin icon curation.
- **`packages/imports`** — `FeedConnector` interface + `NormalizedListing` DTO. Connectors emit `AsyncIterable` so worker streams without buffering (production feeds reach 100+ MB).
- **`packages/pdf`** — Puppeteer + Handlebars renderer with browser singleton + memory-constrained Chromium flags.
- **`packages/ui`** — shadcn/ui pattern. `cn()` helper (clsx + tailwind-merge).
- **`docker-compose.yml`** — Postgres 16 (with `pg_stat_statements` preloaded), PgBouncer transaction pooling, Redis 7 with AOF persistence, Meilisearch v1.12. All four healthchecked.
- **`infra/postgres/init.sql`** — installs pgcrypto, citext, pg_stat_statements on first container start.
- **`nginx/inmolink.conf`** + `nginx/_proxy.conf` — production reverse proxy template for 3 vhosts (public marketplace + dashboard + API+WebSocket with sticky sessions). Per-route rate limits per PLAN §11.4. HSTS, X-Frame-Options, etc.
- **`ecosystem.config.cjs`** — PM2 cluster config (web/public/api ×2 cluster, worker ×2 fork, graceful shutdown windows).
- **`.github/workflows/ci.yml`** — 4-job CI: lint+typecheck, prisma-validate, test (with Postgres+Redis services), build (with bundle-stats artifact). Concurrency cancellation on PR refs.
- **`.github/dependabot.yml`** — weekly grouped npm + monthly Actions updates; major bumps ignored.
- **`.github/PULL_REQUEST_TEMPLATE.md`** — terse template with non-obvious checks (migration committed, all 4 locales touched, can() gate verified, encrypted fields use Enc convention).
- **`.husky/pre-commit`** + `lint-staged.config.cjs` — Biome auto-fix on staged files; Prisma validate+format on schema changes.
- **`pnpm-lock.yaml`** — locked dependency tree; reproducible installs everywhere.
- **All 12 workspace packages typecheck cleanly** under TypeScript strict + verbatim module syntax + noUncheckedIndexedAccess.

### Added (earlier in Sprint 0)

- **Project plan** (`PLAN.md`) — full architecture, 50-row decisions matrix, 14 sections covering exec summary, infrastructure, auth, i18n, storage, plan tiers, scaling phases, public marketplace URLs, cross-cutting concerns, ~50-model data inventory, performance & optimizations catalog, sprint roadmap (12 sprints), risks, verification, and status.
- **Storage deduplication** in PLAN.md §5.1 — content-addressable R2 via SHA-256, `MediaObject` + `MediaVariant` tables with refCount, cross-agency global dedup, 7-day grace before physical R2 delete. ADR 0002 documents the rationale.
- **Performance & Optimizations catalog** in PLAN.md §11 — locked optimizations across storage, database (PgBouncer + read replica day-1), caching (Redis layers + LRU), CDN (Cloudflare HTML caching + Turnstile), search (outbox pattern), frontend (Server Components + bundle budget + shadcn), API/workers (priority queues), real-time (Socket.io Redis adapter), security (Argon2id + CSP nonces), AI features (translation drafts + property description writer), multi-agent UX (smart match notifications), code quality (Biome + Vitest + MSW), SEO depth (structured data), and reliability (session replay + heartbeat checks).
- **Project hygiene files**: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `TROUBLESHOOTING.md`, `.gitignore`.
- **ADR 0001** — Stack choice (TypeScript / Next.js 15 / Fastify / Prisma / PostgreSQL 16 / Meilisearch / Stripe-no-Connect / R2 / Auth.js v5 / Socket.io / sharp / Puppeteer / PM2 / Nginx).
- **ADR 0002** — Storage deduplication via content-addressable R2.
- **Kyero sample feed** at `samples/feeds/kyero-sample.xml` (3.4 MB, 270 properties, real production data) plus full schema documentation and connector implementation notes in `samples/feeds/README.md`. Kyero is the priority connector within Sprint 5.

### Decisions locked (from planning sessions)

- Tenancy: shared dashboard, all agents see all SHARED properties, only owner edits
- Roles: SUPER_ADMIN, AGENCY_ADMIN, AGENT (every agent belongs to an agency, auto-create one-person agency on signup)
- Property visibility: PRIVATE / SHARED / PUBLIC (PUBLIC is paid-gated)
- Agency badge mandatory on every property surface (cards, detail, exports, emails)
- 4 locales day-1: EN (default), ES, DE, FR — separate `*Translation` tables, per-locale Meilisearch indices, locale-prefixed URLs
- Soft-delete: 30-day retention, then auto hard-delete; deleted public URLs 301 (never 404)
- Locations: 4-level hierarchy (COUNTRY → REGION → CITY → AREA), m2m groups, drag-n-drop ordering, super-admin curated only
- Property Types & Features: grouped, hardcoded, AI-suggested icons via Claude Haiku, drag-n-drop
- Imports: per-agent encrypted credentials, per-connection ON/OFF toggle, field-level locks, content-hash image dedup, **streaming SAX parser** mandatory
- Commission: tracked-only (no Stripe Connect, no escrow), per-agency configurable %, handshake confirmation by both agents, super-admin disputes
- Chat: agent-to-agent only (Socket.io), VIEWING-pinned + DIRECT 1:1 threads, WhatsApp + email handoff via deep-link only
- Marketing: full SPW email toolkit (campaigns, templates, per-agency SMTP, custom domain DKIM, suppressions) + Featured Listings — paid-gated
- Tickets: agent → super-admin, fixed enums, R2 attachments (10MB × 5 max)
- Billing: Stripe subscriptions only (per-agency), no trial, super-admin manual grant, EUR + GBP, Stripe Tax + reverse-charge for valid VAT IDs
- Plan tiers: FREE / PRO in v1 (no listing-count limits), BUSINESS / ENTERPRISE reserved in enum
- Paid features: PUBLIC visibility, CSV Export, PDF Export, Email Marketing, Custom email domain, Featured listings (everything else FREE)
- Webhooks (out): full event catalog with retry + dead-letter + replay
- 2FA: optional TOTP
- Audit log: security-sensitive events only, indefinite retention

---

## [0.0.0] — 2026-05-09

### Added

- Repository created at `E:\Repos\Inmolink\`.
- Planning session completed with user.

[Unreleased]: https://github.com/_/_/compare/v0.0.0...HEAD
