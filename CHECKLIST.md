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

### D — Image variant generation worker (next)

- [ ] BullMQ processor on `IMAGE_VARIANT` queue (sharp pipeline)
- [ ] WebP variants at thumb (200) / small (480) / medium (1080) / large (1920)
- [ ] +1 JPEG fallback at "large" for og:image cover only
- [ ] Each variant content-addressable: hash output, dedup via `MediaVariant`
- [ ] Lazy: generate thumb + medium eagerly, small + large on first request
- [ ] Update `PropertyImage.variants` JSON manifest after generation

### E — PropertyImage attach + media management

- [ ] `POST /api/dashboard/properties/:id/images` — attach uploaded media
- [ ] `PATCH /api/dashboard/properties/:id/images/:imageId` — reorder, set cover, alt text
- [ ] `DELETE /api/dashboard/properties/:id/images/:imageId` — decrement refCount
- [ ] Worker: `MEDIA_CLEANUP` daily cron (refCount=0 + scheduledDeleteAt past)

### F — Web dashboard property UI

- [ ] `<AgencyBadge>` shared component in `@inmolink/ui`
- [ ] `/[locale]/dashboard/properties` — list page (cursor pagination, filters)
- [ ] `/[locale]/dashboard/properties/new` — create form (RHF + Zod)
- [ ] Image upload widget — SHA-256 client-side, calls `/api/uploads/sign`
- [ ] `/[locale]/dashboard/properties/[id]` — detail view (owner/admin can edit)
- [ ] `/[locale]/dashboard/properties/[id]/edit` — edit form
- [ ] Multi-locale title/description tabs (en/es/de/fr)

### G — Public marketplace property pages (basic)

- [ ] `/[locale]/property/[slug]-[id]` — ISR-cached detail page
- [ ] JSON-LD `RealEstateListing` structured data
- [ ] OpenGraph + Twitter Card meta
- [ ] `/[locale]/search` — basic Postgres-backed faceted search (Meilisearch in Sprint 3)

### H — Tests

- [ ] Vitest unit: dedup logic in upload service
- [ ] Vitest unit: permission `can()` matrix
- [ ] Playwright E2E: login → create property → upload images → verify variants

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
