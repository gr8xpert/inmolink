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

## Sprint 2 — Locations / Property Types / Features (super-admin curated)

- [ ] Super-admin CRUD UIs for Location / LocationGroup / PropertyType / PropertyTypeGroup / Feature / FeatureGroup
- [ ] Drag-n-drop ordering (`@dnd-kit/core`)
- [ ] Per-locale translation editor
- [ ] AI icon suggester service (Claude Haiku)
- [ ] Filter UI on dashboard property search

## Sprint 3 — Public marketplace MVP

- [ ] Meilisearch outbox pattern (DB write → OutboxEvent → worker → reindex)
- [ ] Per-locale Meilisearch indices
- [ ] Location landing pages (4 levels + groups, all locales)
- [ ] Sitemap generation worker (per-locale, segmented)
- [ ] Anonymous lead form on property pages
- [ ] robots.txt, hreflang, canonical, OG meta sweep

## Sprint 4 — Agencies + Profiles + 2FA + Settings

- [ ] Rich agency profile (logo / banner / hero / socials)
- [ ] Public `/agency/[slug]` and `/agent/[slug]` pages
- [ ] Agency invite flow (email + signed token)
- [ ] User Settings (profile, password change, language)
- [ ] Agency Settings (branding, commission defaults)
- [ ] TOTP 2FA optional

## Sprint 5 — Imports (Kyero priority)

- [ ] FeedConnection + encrypted creds (AES-256-GCM)
- [ ] Adapter interface + Kyero connector (using `samples/feeds/kyero-sample.xml`)
- [ ] Resale Online connector
- [ ] Generic XML connector (mappable)
- [ ] Streaming SAX parser
- [ ] Worker BullMQ jobs (sync + per-image download with content-hash dedup)
- [ ] Field-level lock UI
- [ ] Per-connection ON/OFF toggle
- [ ] Run history + error log UI
- [ ] Manual XML upload path

## Sprint 6 — Viewing Requests + Deals + Chat

- [ ] ViewingRequest workflow (request / accept / decline / reschedule / outcome)
- [ ] AES-encrypted client info on ViewingRequest
- [ ] Deal handshake confirmation (both agents)
- [ ] Dispute → super-admin
- [ ] Socket.io chat (Redis adapter)
- [ ] ChatThread (VIEWING + DIRECT) + ChatMessage + ChatThreadRead
- [ ] WhatsApp + email handoff buttons (deep links)
- [ ] Notifications (in-app + email digest via Resend)

## Sprint 7 — Billing + plan-gating

- [ ] Stripe Checkout
- [ ] Stripe Customer Portal
- [ ] Webhooks + ProcessedStripeEvent
- [ ] Plan tier enforcement helpers across gated features
- [ ] Manual grant UI for super-admin
- [ ] Stripe Tax + reverse-charge for VAT IDs
- [ ] Activate PUBLIC visibility for paid agencies

## Sprint 8 — Marketing

- [ ] AgencyEmailConfig (per-agency SMTP)
- [ ] AgencyEmailDomain (DKIM/SPF/DMARC verification UI)
- [ ] EmailTemplate CRUD + merge tag editor
- [ ] EmailCampaign create / schedule / send
- [ ] Per-recipient tracking (open / click / bounce / unsub)
- [ ] EmailSuppression auto-add
- [ ] FeaturedListing schema + admin curation + public-page rendering

## Sprint 9 — Tickets + Audit log

- [ ] Ticket + TicketMessage UIs
- [ ] R2 attachments
- [ ] Super-admin queue
- [ ] AuditLog wired into security-sensitive actions
- [ ] Audit log viewer

## Sprint 10 — Webhooks (out)

- [ ] WebhookEndpoint + WebhookEvent + WebhookDelivery + WebhookDeliveryAttempt schemas wired
- [ ] Event emission hooks at every relevant point
- [ ] Worker: deliver + retry (1m → 5m → 30m → 2h → 12h) + dead-letter
- [ ] Agency endpoint config UI
- [ ] Super-admin delivery view + manual replay

## Sprint 11 — Export

- [ ] Export queue + worker
- [ ] CSV generator
- [ ] PDF brochure / portfolio templates (Puppeteer + Handlebars)
- [ ] R2 + signed download links + 7-day expiry

## Sprint 12 — Pressure test + launch prep

- [ ] Seed 15M synthetic properties
- [ ] k6 baselines (p95 < 300ms dashboard, < 500ms public)
- [ ] Postgres tuning + index review (pg_stat_statements)
- [ ] Better Stack / Uptime Robot
- [ ] DR drill (restore from backup)
- [ ] GDPR pages: privacy, terms, cookie consent
- [ ] robots.txt + sitemap validation
- [ ] First deploy to VPS

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
