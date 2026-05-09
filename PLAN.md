# Plan: Inmolink — Architecture & Implementation

> Multi-agent real-estate marketplace: shared dashboard, cross-agent visibility, agent-to-agent viewing requests + commission split (tracked-only), public buyer-facing marketplace, multi-language EU. Inspired by SPW but fundamentally different in tenancy + scale + payments.

---

## 0. EXECUTIVE SUMMARY

**Product**: Multi-agent real-estate marketplace for EU agencies. All agents share one dashboard, see each other's listings, can request viewings on each other's properties, and split commissions when a deal closes (5%/50% default, configurable per agency, settled outside Inmolink). Public buyer-facing marketplace.

**Scale targets**: 500 → 5,000 agents, 20K-30K properties each, ~50 images + video + floor plan per property → up to **150M properties / 7.5B image objects / 15PB media** at ceiling. Design for ceiling, ship for floor.

**Constraints**: Solo developer, vibe-coded with Claude. Single VPS (24-core / 128GB target). ~$100/mo budget for v1. Greenfield user base. Storage on Cloudflare R2; payments Stripe-only.

**Stack** (all locked):
- Monorepo: pnpm + Turborepo
- `apps/web` Next.js 15 (auth dashboard) | `apps/public` Next.js 15 (anonymous marketplace, ISR/SEO) | `apps/api` Fastify (sockets, webhooks, heavy endpoints) | `apps/worker` BullMQ
- DB: PostgreSQL 16 + Prisma | Cache/Queue: Redis 7 + BullMQ | Search: Meilisearch (adapter-isolated)
- Auth: Auth.js v5 | Real-time: Socket.io | Storage: Cloudflare R2 + DNS/CDN/WAF (free tier)
- Payments: Stripe subscriptions + Stripe Tax (no Connect, no escrow) | Email: per-agency SMTP + Resend platform
- AI icon suggester: Claude Haiku | PDF: Puppeteer + Handlebars | Image: sharp
- PM2 cluster + Nginx | CI: GitHub Actions → SFTP/rsync | Sentry + Better Stack (free)

**13 modules**: Properties, Locations, Property Types & Features, Imports, Agencies, Viewing Requests + Deals, Chat, Marketing, Tickets, Billing, Export, Settings, Super Admin.

**Total v1 effort**: ~22-28 weeks solo, or ~14-18 weeks with descope (defer Webhooks, Featured listings, PDF Export, Custom email domain, Audit log to v1.5).

---

## 1. DECISIONS MATRIX

| # | Topic | Decision |
|---|---|---|
| 1 | Tenancy | Shared dashboard, all agents see all SHARED properties (read-only); only owner edits |
| 2 | Roles | SUPER_ADMIN, AGENCY_ADMIN (edit/delete any property in agency), AGENT |
| 3 | Property visibility | PRIVATE (owner only) / SHARED (all agents) / PUBLIC (also marketplace) |
| 4 | Agency-of-one | Required: every agent belongs to an agency; auto-create one-person agency on signup |
| 5 | Agency badge | Mandatory on every property surface (cards, detail, exports, emails) |
| 6 | Public marketplace | Anonymous browsing only in v1; buyer accounts deferred to v2 |
| 7 | Locales | EN default + ES + DE + FR; locale-prefixed URLs; per-locale Meilisearch index; per-locale sitemaps + hreflang |
| 8 | Lead routing | Public inquiry → Lead → owner agent only |
| 9 | Soft delete | 30 days, then auto hard-delete; deleted public URLs 301 (never 404) |
| 10 | Locations | 4 levels (COUNTRY → REGION → CITY → AREA); m2m groups; centroid lat/lng; SEO landing pages all 4 levels + groups; super-admin only |
| 11 | Property Types | Grouped (PropertyType + PropertyTypeGroup); custom upload icon; AI-suggested default |
| 12 | Features | Grouped (Interior/Exterior/Amenities/Views); boolean only; Lucide icon library; AI-suggested default |
| 13 | AI icon suggester | Claude Haiku call on create/rename; admin-override flag prevents re-suggest |
| 14 | Imports | Per-agent encrypted credentials; per-connection ON/OFF; cron via BullMQ repeatable; field-level locks; download → R2 → variants |
| 15 | Connectors | Kyero, Resale Online, Generic XML (mappable); manual XML upload supported |
| 16 | Conflict resolution | Field-level locks: agent locks fields, feed updates rest |
| 17 | Agency joining | Invite-only (admin emails, signed token, expiry) |
| 18 | Branding | Name + logo only on properties (no per-agency theming/colors in v1) |
| 19 | Viewing requests | Agent-to-agent on shared properties; client info AES-encrypted; default 3-day expiry |
| 20 | Commission flow | **Tracked-only** (no Stripe Connect, no escrow); settled outside Inmolink |
| 21 | Commission % | Per-agency configurable; default 5% total / 50% to introducer = 2.5% each |
| 22 | Sale confirmation | Handshake (both agents must confirm); dispute → super-admin |
| 23 | Chat scope | Agent-to-agent only (in-platform); WhatsApp + email handoff buttons |
| 24 | Threading | VIEWING (auto-pinned) + DIRECT (free-form 1:1) |
| 25 | Real-time | Socket.io on api; offline-recipient email digest 5-min debounce |
| 26 | WhatsApp | `https://wa.me/<phone>?text=...` deep-link only |
| 27 | Email handoff | `mailto:` deep-link only (no inbound parsing) |
| 28 | Marketing | Full SPW email toolkit: Campaigns + Templates + SMTP Config + Custom Domain (DKIM) + Suppressions; per-agency SMTP; recipients = own leads + own contacts only; paid-gated |
| 29 | Featured listings | Paid-gated; surfaces: PUBLIC_HOME / LOCATION_PAGE / SEARCH_TOP / AGENCY_PROFILE_TOP; tiered count |
| 30 | Tickets | Agent → super-admin only; fixed enums; R2 attachments (10MB × 5) |
| 31 | Billing | Stripe subscriptions; per-agency; no trial; super-admin manual grant; EUR + GBP; Stripe Tax |
| 32 | Plan tiers | FREE / PRO in v1 (no listing-count limits, only feature gates); BUSINESS / ENTERPRISE reserved in enum for future; see §6 |
| 33 | Paid features | PUBLIC visibility, CSV Export, PDF Export, Marketing (campaigns/templates/SMTP/suppressions/custom domain), Featured listings — that's it. Everything else (incl. Imports, PRIVATE visibility, Rich profile, Chat, Viewing+commission) is FREE. |
| 34 | Export | CSV (Pro+), PDF brochure/portfolio (Pro+); Puppeteer; R2; 7-day expiry |
| 35 | 2FA | Optional TOTP; recovery codes |
| 36 | Webhooks (out) | Full event catalog; per-agency endpoints; HMAC-signed; retry 1m/5m/30m/2h/12h then dead-letter; manual replay |
| 37 | Bulk ops | Day-1 super-admin: bulk grant/revoke plan, re-index search, force re-import, bulk email |
| 38 | Audit log | Security-sensitive events only; indefinite retention |
| 39 | Backups | Nightly Postgres pg_dump → R2 (30-day lifecycle); Meilisearch re-buildable; restore drill quarterly |
| 40 | Hygiene files | CHANGELOG.md, TROUBLESHOOTING.md, CLAUDE.md, ARCHITECTURE.md, docs/adr/NNNN-*.md |
| 41 | Storage dedup | Content-addressable R2 via SHA-256; `MediaObject` table with refCount; cross-agency global dedup; variants also dedup'd; 7-day grace before physical delete (see §5.1, ADR 0002) |
| 42 | DB read replica | From day 1: logical replication on same VPS. Reads → replica, writes → primary. Migration to off-box is a config flip (Phase 2 trigger) |
| 43 | DB connection pooling | PgBouncer transaction pooling in front of Postgres |
| 44 | Caching strategy | Redis: taxonomy 1h, plan-tier 5m, listings 60s, facets 1m. In-process LRU for super-hot reads. See §11.3 |
| 45 | CDN HTML caching | Public pages with `s-maxage=300, stale-while-revalidate=600`, purged via Cloudflare API on update |
| 46 | Search reindex | Outbox pattern (DB write → OutboxEvent → worker → Meilisearch). Survives Meili downtime; no lost updates |
| 47 | Password hashing | Argon2id (not bcrypt) — modern OWASP recommendation |
| 48 | CAPTCHA | Cloudflare Turnstile (free) on signup + public lead form + suspicious auth |
| 49 | AI translation drafts | Locked in v1: one-click EN → ES/DE/FR draft via Claude Haiku |
| 50 | Bot/build hygiene | Biome (not ESLint+Prettier), Vitest (not Jest), MSW for mocks, husky+lint-staged pre-commit, OpenAPI auto-spec from Fastify, seed fixture for instant dev |

---

## 2. INFRASTRUCTURE

### 2.1 Single-VPS layout (Phase 0)

All services run on the one VPS. PostgreSQL, Redis, and Meilisearch are all **free open-source software, self-hosted** (installed via apt/docker — no external/managed provider, no recurring SaaS fee for them).

```
24-core / 128GB / NVMe (Ubuntu 22.04+)
├── Nginx (TLS, reverse proxy, static)
├── PostgreSQL 16        ← self-hosted, 32-48GB shared_buffers
├── Redis 7              ← self-hosted, cache + BullMQ + sessions
├── Meilisearch          ← self-hosted, per-locale indices, ~2-4GB RAM
├── Web (Next.js)        ← PM2 cluster ×2-4
├── Public (Next.js)     ← PM2 cluster ×2-4
├── API (Fastify)        ← PM2 cluster ×2-4
└── Worker (BullMQ)      ← PM2 ×2
```

Headroom for ~500-1000 users on this single box. Scale-out triggers in §7 move services off-box as they grow.

### 2.2 Cloudflare layer

DNS proxied (free) → CDN, WAF, DDoS, full SSL. R2 for media (10GB free + $0.015/GB/mo, **no egress**). Browser → R2 signed-URL upload (never proxy big files through API).

### 2.3 Cost estimate (v1)

VPS (24-core / 128GB target) · R2: $0-15 · Domain: ~$1 · Cloudflare/Sentry/Better Stack free · Resend: $0→$20 · **Total ~$60-100/mo** ✓

### 2.4 Repo structure

```
inmolink/
├── apps/
│   ├── web/                  Next.js 15 dashboard (auth)
│   ├── public/               Next.js 15 marketplace (anonymous, ISR)
│   ├── api/                  Fastify (sockets, webhooks, heavy)
│   └── worker/               BullMQ workers
├── packages/
│   ├── db/                   Prisma schema + client + migrations
│   ├── shared/               Zod, types, i18n strings
│   ├── search/               Meilisearch adapter (swap-ready)
│   ├── auth/                 Auth.js v5 + permission helpers
│   ├── ai/                   Icon suggester (Claude Haiku)
│   ├── imports/              Kyero / Resale / GenericXML connectors
│   ├── pdf/                  Puppeteer + Handlebars
│   └── ui/                   Shared shadcn components
├── docs/
│   ├── adr/                  Architecture Decision Records
│   └── runbooks/             Restore-from-backup, manual ops
├── scripts/                  seed, seed-load-test, reindex, admin/
├── docker-compose.yml        Local: Postgres + Redis + Meilisearch
├── docker-compose.prod.yml   Single-VPS deployment
├── ecosystem.config.js       PM2
├── nginx/                    Templates
├── README.md, CLAUDE.md, ARCHITECTURE.md, CHANGELOG.md, TROUBLESHOOTING.md
├── turbo.json, pnpm-workspace.yaml, package.json
```

---

## 3. AUTH & PERMISSIONS

- 3 roles: SUPER_ADMIN, AGENCY_ADMIN, AGENT
- `can(user, action, resource)` matrix in `packages/auth/can.ts`
- Plan-tier checks: `can(user, 'feature:export.pdf')` → middleware returns 403 `{ error: 'PLAN_REQUIRED', requiredTier: 'PRO' }`
- Property visibility filter applied in every read query

---

## 4. INTERNATIONALIZATION

- Locales: `en` (default), `es`, `de`, `fr`
- Translatable entities: Property (title/description/meta/per-locale slug), Location, PropertyType, Feature, all groups, Agency
- Storage: separate `*Translation` tables keyed by `(parentId, locale)`
- Routing: locale-prefixed URLs via next-intl
- SEO: hreflang + canonical per locale + per-locale sitemaps
- Search: per-locale Meilisearch indices
- Missing translation: render default (en) with banner; super-admin sees gaps in admin

---

## 5. STORAGE & MEDIA

- All media in R2 only (no DB blobs)
- Browser → R2 signed-URL upload for originals (never proxy big files through API)
- Worker generates **WebP variants only** at 4 sizes: thumb (200) / small (480) / medium (1080) / large (1920) — used for all in-app + browser rendering (modern browsers handle WebP natively)
- **Plus 1 JPEG fallback** at "large" size for the **cover image only** — used as `og:image` for Facebook / WhatsApp / Twitter / email-client scrapers that may not handle WebP
- AVIF dropped: marginal compression gain not worth the encoder cost + extra storage at 7.5B images
- Floor plans: same WebP-only pipeline. Videos: MP4 via R2+CDN (HLS deferred). Virtual tour: external URL (Matterport).
- Per non-cover image: 4 WebP variants. Per cover image: 4 WebP + 1 JPEG = 5 variants.

### 5.1 Storage deduplication (content-addressable R2)

**Real estate is unusually dedup-friendly**: feed re-imports re-deliver identical images, MLS-shared listings have identical originals across agencies, agency logo overlays repeat, deterministic variant pipeline produces byte-identical outputs. Estimated **30-50% R2 storage savings** at our scale.

**Mechanism** (application-layer, since R2 doesn't dedup natively):
- Every blob uploaded gets SHA-256 hashed
- DB has a `MediaObject` table keyed by hash (UNIQUE)
- `PropertyImage` / `PropertyFloorPlan` / `PropertyVideo` reference `MediaObject.id` by FK (they don't hold R2 keys directly)
- Multiple media rows can point to the same `MediaObject` → one R2 object, many references
- `MediaObject.refCount` tracks the number of references; physical R2 delete only when refCount=0 + 7-day grace period
- **Dedup boundary: global** (cross-agency) — hash collision = content equality, not a privacy leak

**Variant dedup**: each `(sourceHash, targetSize, targetFormat)` tuple is also hashed. The 4 WebP variants of a deduped original are themselves deduped — generate once, reference everywhere.

**Upload flow**:
1. Browser computes SHA-256 (Web Crypto API, ~ms)
2. Browser asks API: "do you already have hash X?"
3. API: yes → return existing `mediaObjectId`, increment refCount; OR no → return signed PUT URL keyed by the hash
4. Browser uploads to R2 if needed; API creates `MediaObject` (refCount=1) on first sight
5. App creates `PropertyImage` row with `mediaObjectId`

**Delete flow**: atomic decrement of refCount → if 0, set `scheduledDeleteAt = now + 7d` → daily worker hard-deletes from R2 past the grace window.

**Pipeline versioning**: variant generation must be deterministic. If we ever change encoder settings (e.g., sharp version, WebP quality), bump a `pipelineVersion` field and treat outputs as a new content-addressable namespace — old variants stay valid until orphaned.

See ADR 0002 for full rationale and trade-offs.

---

## 6. PLAN TIER FEATURE MATRIX

**No listing-count limits.** All agents get unlimited properties. Only specific features are paid-gated.

Two tiers in v1: **FREE** and **PRO**. Schema reserves `BUSINESS` and `ENTERPRISE` enum values for future tiers (e.g., higher email volume caps, priority support) — not active in v1.

| Feature | Free | Pro |
|---|---|---|
| Unlimited listings | ✅ | ✅ |
| Manual property upload | ✅ | ✅ |
| Imports (Kyero / Resale / XML) | ✅ | ✅ |
| Visibility: SHARED (cross-agent dashboard) | ✅ | ✅ |
| Visibility: PRIVATE (owner-only) | ✅ | ✅ |
| Rich agency profile (logo/banner/hero/socials) | ✅ | ✅ |
| Agent + agency public profile pages | ✅ | ✅ |
| In-platform chat | ✅ | ✅ |
| Viewing requests + commission tracking | ✅ | ✅ |
| **Visibility: PUBLIC (buyer marketplace)** | ❌ | ✅ |
| **Export CSV** | ❌ | ✅ |
| **Export PDF (brochure / portfolio)** | ❌ | ✅ |
| **Email Marketing (campaigns / templates / SMTP / suppressions)** | ❌ | ✅ |
| **Custom email domain (DKIM)** | ❌ | ✅ |
| **Featured listings (homepage / location-page promotion)** | ❌ | ✅ |

Super-admin can manually grant Pro to any agency from the admin panel (with optional expiry date + reason).

---

## 7. SCALING PHASES (with explicit triggers)

| Phase | Trigger | Action |
|---|---|---|
| 0 | day 1 | All on single VPS |
| 1 | DB CPU > 70% / p95 query > 200ms | Tune `shared_buffers`, indexes, `pg_stat_statements` |
| 2 | DB still hot / >200 concurrent users | Postgres logical read replica; route reads |
| 3 | DB box >80% disk / >1000 concurrent users | Move Postgres to managed (Neon/Crunchy) or sibling box |
| 4 | Worker queue depth >1000 sustained | Move workers to sibling VPS |
| 5 | Meilisearch RAM >8GB | Move Meilisearch off-box or migrate to OpenSearch |
| 6 | High repeat-image traffic | Cloudflare Pro + Image Resizing |
| 7 | >3000 concurrent users + cross-region | Regional Postgres shards by agency country |

Every triggered migration = own ADR.

---

## 8. PUBLIC MARKETPLACE — URL STRUCTURE

- `/[locale]/` — home (featured + recent)
- `/[locale]/buy/[country]/[region]/[city]/[area]` — location landings (all 4 levels)
- `/[locale]/buy/group/[group]` — location group landing (e.g. costa-del-sol)
- `/[locale]/property/[slug]-[id]` — property detail (ISR, on-demand revalidate)
- `/[locale]/agency/[slug]`, `/[locale]/agent/[slug]` — profile pages
- `/[locale]/search` — faceted search via Meilisearch
- `/sitemap.xml` + `/sitemap-properties-NNNN.xml` (worker-generated to R2)
- `/robots.txt` — public allows; dashboard `Disallow: /`

SEO: JSON-LD `RealEstateListing` per property; OG + Twitter Card; canonical + hreflang; deleted property URLs 301 (never 404).

Public rate limits (per IP, Cloudflare WAF + Fastify rate-limit): /search 60/min · /property/* 120/min · /api/lead 5/min + captcha after 3rd.

---

## 9. CROSS-CUTTING

### 9.1 GDPR
Data export (agent → ZIP via worker → R2 → emailed link). Right to erasure (super-admin tool: anonymize PII, keep audit log + deal history with anonymized actor). Cookie consent banner on public site. Privacy + Terms pages — lawyer-reviewed. DPA template on request.

### 9.2 Backups
Postgres: nightly pg_dump → R2 (30-day lifecycle). R2: 11-nines + archive bucket for soft-deleted media. Meilisearch: re-buildable from Postgres via `scripts/reindex.ts`. Redis: ephemeral. Restore drill quarterly.

### 9.3 Security
Helmet (CSP/HSTS/X-Frame-Options) on all apps. Strict CORS. Rate limits everywhere (Redis-backed). AES-256-GCM for: SMTP creds, Stripe keys, import credentials, webhook secrets, TOTP secrets, encrypted client info on ViewingRequest. Bcrypt cost 12. Zod validation everywhere. Prisma parameterized only. File upload: extension + magic bytes + max size. CSRF: SameSite=Lax + tokens.

### 9.4 Monitoring & Logging
Sentry (free) for errors. Better Stack / Uptime Robot (free) for uptime. PM2 for process auto-restart. Pino JSON logs with request-id + PII redaction. Grafana + Prometheus deferred to Phase 3+.

### 9.5 Pressure-test plan (pre-launch)
1. Seed 15M synthetic properties + 750M image rows
2. k6: 100 concurrent agents (dashboard) + 1000 anonymous public visitors + 50 concurrent property mutations + 20 active chat threads
3. Targets: p95 < 300ms dashboard, < 500ms public
4. 8-hour soak at 50% load — check memory leaks, DB connection exhaustion
5. EXPLAIN ANALYZE on hot queries; tune `shared_buffers`, `effective_cache_size`, `work_mem`
6. R2 parallel upload test: 100 images × 100 concurrent users
7. Set scale-out triggers tuned to actual numbers

---

## 10. DATA MODEL OVERVIEW (model list per module)

> Full Prisma schema lives in `packages/db/prisma/schema.prisma` once we build it. Below is the inventory — model names, key fields, enums. ~50 models total.

### Tenancy
- **User** (id, email, slug, agencyId, role, profile, languagesSpoken, isActive, totp fields)
- **Agency** (id, slug, name, logo/banner/hero R2 keys, contact, socials, countryCode, isPublic)
- **AgencyTranslation** (description, metaTitle, metaDescription per locale)
- **AgencyInvite** (email, token, expires, accepted)
- **AgencySettings** (defaultCommissionPct, defaultIntroducerSharePct, viewingResponseDays, dealConfirmationDays)
- **UserSettings** (preferredLocale, notification toggles, emailDigestFrequency, totp encrypted)
- Enum: `UserRole { SUPER_ADMIN AGENCY_ADMIN AGENT }`

### Properties
- **Property** (ownerUserId, ownerAgencyId required, source, externalRef, status, visibility, deletedAt, hardDeleteAt, transactionType, price/currency, specs, propertyTypeId, locationId, lat/lng, lockedFields JSON, version)
- **MediaObject** (sha256 UNIQUE, r2Key derived from hash, bytes, mimeType, width, height, durationSec, refCount, pipelineVersion, scheduledDeleteAt) — content-addressable, dedup-keyed
- **MediaVariant** (sourceMediaObjectId FK, sha256 UNIQUE, format webp/jpeg, sizeName thumb/small/medium/large, width, height, bytes, refCount, pipelineVersion) — variants are themselves content-addressable
- **PropertyImage** (propertyId, mediaObjectId FK to MediaObject, altText, position, isCover) — no R2 key here, comes via MediaObject
- **PropertyFloorPlan** (propertyId, mediaObjectId FK, label, position)
- **PropertyVideo** (propertyId, mediaObjectId FK, label, position)
- **PropertyTranslation** (title, description, slug per locale, meta)
- **PropertyFeature** (m2m: propertyId × featureId)
- Enums: `PropertySource { MANUAL KYERO RESALE_ONLINE GENERIC_XML }`, `PropertyStatus { DRAFT ACTIVE UNDER_OFFER SOLD RENTED WITHDRAWN }`, `PropertyVisibility { PRIVATE SHARED PUBLIC }`, `TransactionType { SALE RENT SHORT_TERM }`
- Indexes: ownership, status+visibility, location+status+visibility, type+status+visibility, deletedAt, hardDeleteAt; unique `(source, externalRef)` for re-import dedup
- Partition trigger: > 10M live rows → declarative partition by `country_code`

### Locations / PropertyTypes / Features (super-admin curated)
- **Location** (level, parentId, countryCode, lat/lng, position, isActive)
- **LocationGroup** + **LocationGroupMember** (m2m)
- **PropertyTypeGroup**, **PropertyType** (groupId, position, iconKind LIBRARY/CUSTOM, iconName, iconR2Key, AI-suggested flags)
- **FeatureGroup**, **Feature** (groupId, position, iconName Lucide, AI-suggested flags)
- All `*Translation` tables: uniform `(parentId, locale, name, slug?, meta?)` shape
- Enums: `LocationLevel { COUNTRY REGION CITY AREA }`, `IconKind { LIBRARY CUSTOM }`

### Imports
- **FeedConnection** (ownerUserId, kind, feedUrl, credentialsEnc, fieldMappings, syncEnabled, cronSchedule, lastRun/Success/Error, isLocked mutex)
- **FeedRun** (status, triggeredBy, item counts, errorsLog JSON)
- Enums: `FeedConnectorKind`, `FeedRunStatus`, `FeedRunTrigger`

### Viewing Requests + Deals
- **ViewingRequest** (propertyId, owner/introducer, encrypted client info, preferredDates, scheduledAt, status, outcome, chatThreadId, expiresAt)
- **Deal** (viewingRequestId unique, agreed price, commissionPct + introducerSharePct snapshot, computed amounts, handshake timestamps, dispute fields, closingDate)
- Enums: `ViewingStatus`, `ViewingOutcome`, `DealStatus`

### Chat
- **ChatThread** (kind VIEWING/DIRECT, viewingRequestId optional unique, participants A/B + min/max for unique-direct, lastMessage*, unique constraint on direct threads)
- **ChatMessage** (body, attachments JSON, systemKind, systemPayload, edit/delete timestamps)
- **ChatThreadRead** (per-user lastReadAt + lastReadMessageId)
- Enum: `ChatThreadKind { VIEWING DIRECT }`

### Marketing
- **AgencyEmailConfig** (encrypted SMTP creds, DKIM keys, testStatus)
- **AgencyEmailDomain** (domain, verifiedAt, SPF/DKIM/DMARC status)
- **EmailTemplate** (name, subject, bodyHtml, bodyText, mergeTags-supported)
- **EmailCampaign** (recipientFilter JSON, schedule, status, sent/delivered/opened/clicked/bounced/unsub counts)
- **EmailCampaignRecipient** (per-recipient send/event timestamps)
- **EmailSuppression** (agencyId+email unique; reason BOUNCE/UNSUBSCRIBE/COMPLAINT/MANUAL)
- **FeaturedListing** (propertyId, surface, startsAt/endsAt, position, source PLAN_INCLUDED/PAID_BOOST)
- Enums: `CampaignStatus`, `SuppressionReason`

### Tickets
- **Ticket** (number autoinc, openedById, agencyId, category, priority, status, subject, assignedToId, resolvedAt/closedAt, lastActivityAt)
- **TicketMessage** (body, attachments JSON, isInternal flag)
- Enums: `TicketCategory`, `TicketPriority`, `TicketStatus`

### Billing
- **Plan** (tier unique, name, stripeProductId, stripePrice* per cycle/currency, features JSON)
- **AgencySubscription** (planTier, status, stripe* refs, billingCycle, currency, period dates, cancelAtPeriodEnd, manual-grant fields)
- **SubscriptionInvoice** (stripeInvoiceId unique, amount/tax/total cents, status, periodStart/End)
- **ProcessedStripeEvent** (stripeEventId unique — idempotency)
- Enums: `PlanTier { FREE PRO BUSINESS ENTERPRISE }`, `SubscriptionStatus`, `BillingCycle`

### Export
- **Export** (requestedById, agencyId, kind, status, filters/propertyIds, locale, resultR2Key, expiresAt, errorMessage)
- Enums: `ExportKind { CSV PDF_PROPERTY PDF_PORTFOLIO }`, `ExportStatus`

### Webhooks (out)
- **WebhookEndpoint** (agencyId, url, secretEnc HMAC, events array, isActive)
- **WebhookEvent** (type, agencyId, payload JSON)
- **WebhookDelivery** (status, attemptCount, nextAttemptAt, succeededAt, deadLetteredAt)
- **WebhookDeliveryAttempt** (responseStatus, responseBodyTrunc, errorMessage, durationMs)
- Enums: `WebhookEventType` (~14 types), `WebhookDeliveryStatus`
- Retry: 1m → 5m → 30m → 2h → 12h → DEAD_LETTERED

### Audit log
- **AuditLog** (type, actorUserId/Ip/Ua, targetKind+Id, agencyId, metadata JSON)
- Enum `AuditEventType` (~20 events: USER_LOGIN, PASSWORD_CHANGED, PLAN_CHANGED, PROPERTY_DELETED, DEAL_DISPUTED, WEBHOOK_REPLAYED, SUPER_ADMIN_BULK_OPERATION, etc.)

**Total**: ~50 models, ~20 enums.

---

## 11. PERFORMANCE & OPTIMIZATIONS

> Locked optimizations baked into the v1 plan. Most are tweaks to sprints already in §12 — no net-new sprints. Cost/revenue optimizations explicitly skipped (out of scope for this phase).

### 11.1 Storage & media (beyond dedup §5.1)
- **Lazy variant generation** — generate only `thumb` + `medium` eagerly on upload; `small` + `large` lazily on first request, then cached in R2. ~50% upfront variant compute saved.
- **Strip EXIF on upload** — privacy (geotags!) + ~10-50KB savings per image at scale.
- **HEIC → WebP conversion server-side** — iPhone HEIC uploads converted automatically.
- **R2 Infrequent Access tier** for soft-deleted media (after 30 days) — ~33% cheaper.
- **Orphan cleanup worker** — find R2 objects with no DB reference, older than 7 days → delete. Defense against bug-induced storage leaks.
- **Per-size image quality tuning** — thumb=q70, small=q75, medium=q80, large=q85. ~20% smaller than uniform q90 with no perceptible quality loss.

### 11.2 Database (Postgres)
- **PgBouncer** transaction pooling — 1000s of app connections → ~50 actual Postgres connections.
- **Read replica from day 1** — logical replication on same VPS. Public marketplace + dashboard reads route to replica; mutations to primary. Zero-rewrite path when replica moves off-box at Phase 2.
- **Cursor pagination** on all list endpoints — `WHERE (createdAt, id) > (cursor)`; no `OFFSET` on hot lists.
- **Covering indexes** on hot list queries — include SELECT columns to skip heap fetches.
- **Materialized views** for SEO landing pages (top properties per location/group) — refreshed every 15 min via worker.
- **`pg_stat_statements`** enabled from day 1.
- **Partitioning ADR queued** — at 10M Property rows, partition by `country_code`. ADR drafted before we hit it.

### 11.3 Caching (Redis)
- **Taxonomy cache** (Locations / PropertyTypes / Features) — 1-hour TTL, invalidated on super-admin edit. Renders on every page; saves ~30% DB load.
- **Plan-tier check cache** — 5-min TTL per agency, invalidated on plan change.
- **Property listing cache** — 60s TTL on hot lists (homepage, top-of-search), tag-based purge on property update.
- **Search facet counts cache** — 1-min TTL.
- **In-process LRU** for super-hot reads (taxonomy lookups) — sub-ms, no Redis round-trip.

### 11.4 CDN / Cloudflare
- **HTML caching** with `Cache-Control: s-maxage=300, stale-while-revalidate=600` on public pages — Cloudflare edge, 20ms anywhere in EU. Purged via API on update.
- **Brotli compression** on origin (Nginx).
- **HTTP/3** auto-enabled via Cloudflare proxy.
- **Turnstile** (Cloudflare's free reCAPTCHA alternative) on signup, public lead form, and suspicious auth attempts.

### 11.5 Search (Meilisearch)
- **Outbox pattern** for reindex — DB writes also write `OutboxEvent`; worker drains it → Meilisearch. Survives Meilisearch downtime, no lost updates.
- **Geo-filter search** via Meilisearch `_geoRadius` — "within 10km of city X" public queries.
- **Saved searches + match notifications** — agents save filter sets; nightly worker matches new properties → in-app + email alerts. Drives viewing-request flow + retention.
- **Search analytics** — log query terms, no-result queries, top facets. Super-admin sees catalog gaps.

### 11.6 Frontend (Next.js 15)
- **Default to Server Components** — minimal client JS.
- **`next/image`** with R2 URLs + multiple sizes → automatic `<picture>` srcset selection.
- **Streaming SSR** for slow data — don't block first paint on Meilisearch.
- **Bundle budget in CI** — fail PR if main bundle > 250KB. `@next/bundle-analyzer`.
- **Variable fonts subsetted** to actual chars used.
- **Preconnect** to R2 + Cloudflare image hostnames in `<head>`.
- **shadcn/ui** — copy-paste components, zero runtime cost (no MUI / AntD).

### 11.7 API & workers
- **BullMQ priority queues** — high (email send, webhook delivery, real-time fanout), medium (imports, exports), low (variants, reindex).
- **Concurrency caps per queue** — variants 4, imports 1 per agency, emails 10.
- **All jobs idempotent by design** — every job retries safely.
- **Graceful PM2 reload** — drain in-flight jobs before kill.
- **Request batching** — `POST /api/images/register-batch` instead of N round trips.

### 11.8 Real-time (Socket.io)
- **Redis adapter from day 1** — single VPS now, multi-instance later with zero code change.
- **Sticky sessions** in Nginx for WebSocket upgrade.
- **Offline message queue** — BullMQ holds messages for offline users → email digest after 5 min, replay on reconnect.

### 11.9 Security / anti-abuse
- **Argon2id** for password hashing (modern OWASP, replaces bcrypt).
- **Per-IP + per-email auth rate limiting** — prevent credential stuffing.
- **Import anomaly detection** — pause + alert if a feed run delivers >5× typical volume.
- **Auto-suppress hard-bouncers** + per-agency suspend if bounce rate >5%.
- **CSP nonces** instead of `unsafe-inline`.
- **Cookie security**: httpOnly + Secure + SameSite=Lax (Strict for auth cookies).

### 11.10 AI features (Claude Haiku)
- **AI translation drafts** — agent writes property in EN, one-click → ES/DE/FR drafts. Solves missing-translation problem.
- **AI property description writer** (paid-tier feature) — raw facts → polished description per locale.
- **AI search query parsing** — natural-language query → structured filter on public marketplace.
- **AI icon suggester** (already in plan §15) — for PropertyType / Feature icons.
- **AI alt-text on images: SKIPPED** — agents enter alt-text manually.

### 11.11 Multi-agent UX wins
- **Smart match notifications** — new property matches an agent's saved search → alert; direct path to viewing-request flow → commission.
- **Agency-internal feed** — agents see their own colleagues' new listings first.
- **"My collaborations" view** — open viewing requests + pending deals across all properties.
- **Activity score per agency** — gentle gamification.
- **One-click "share with agent"** — packages property card + viewing-request shortcut into chat.

### 11.12 Code quality / DX
- **Biome** instead of ESLint + Prettier (single tool, ~10× faster).
- **Vitest** instead of Jest (modern, faster, ESM-native).
- **MSW** for API mocking in tests.
- **Pre-commit hooks** (husky + lint-staged) — block bad commits.
- **TypeScript path aliases** (`@/db`, `@/shared`, `@/ui`).
- **GitHub Actions caching** — pnpm store + turbo cache for fast CI.
- **Auto-generated OpenAPI spec** from Fastify routes (`@fastify/swagger`) → frontend codegen typed client.
- **Seed fixture** (5 agencies / 50 agents / 500 properties) for instant productive dev — `pnpm seed`.

### 11.13 SEO depth (beyond §8)
- **Schema.org `RealEstateAgent` + `RealEstateAgency`** on profile pages.
- **Breadcrumb structured data** on every public page.
- **FAQ structured data** on location landing pages (super-admin curates Q&A).
- **Internal linking**: each property page links to 3-5 similar properties + 1 location page → topical cluster signal.

### 11.14 Reliability
- **Sentry session replay** on errors (free tier ~50/mo) — debug 10× faster.
- **Better Stack heartbeat checks** — alert on dead worker / dead service.
- **BullMQ persistence** config — jobs survive Redis restart.

---

## 12. IMPLEMENTATION ROADMAP (sprints)

### Sprint 0 — Foundation (1-2 weeks)
Repo scaffold (turbo, pnpm, all `apps/*` and `packages/*`). Prisma core schema (tenancy + audit + billing skeleton + i18n tables). Auth.js v5 + email verification + password reset. docker-compose (Postgres+Redis+Meilisearch). Nginx + PM2 + ecosystem. GitHub Actions (lint/typecheck/test/migrate-validate/build). First deploy to VPS via SFTP/rsync. Sentry + Resend + Stripe accounts. Hygiene files + ADR 0001.

### Sprint 1 — Properties core (2-3 weeks)
Property + media + Translation schemas. Manual create/edit/delete. Browser→R2 signed-URL upload. Worker variant generation (sharp WebP only + 1 JPEG on cover). List/detail/search (Postgres-backed). Agency badge on every surface. Visibility = SHARED only (PUBLIC + PRIVATE in Sprint 7). next-intl scaffolding (4 locales).

### Sprint 2 — Locations / Property Types / Features (2 weeks)
Schemas + super-admin CRUD with drag-n-drop. Per-locale translation editor. AI icon suggester (Claude Haiku). Filter UI on dashboard search.

### Sprint 3 — Public marketplace MVP (2-3 weeks)
`apps/public` with locale routing. Property detail (ISR + structured data + OG). Search via Meilisearch. Location landing pages (4 levels + groups). Sitemap generation. Anonymous lead form. robots.txt + hreflang + canonical.

### Sprint 4 — Agencies + Profiles + 2FA + Settings (2 weeks)
Rich agency profile. Public `/agency/[slug]` and `/agent/[slug]`. Invite flow. User & agency settings. TOTP 2FA optional.

### Sprint 5 — Imports (2-3 weeks)
FeedConnection + encrypted creds. Adapter interface, **Kyero first** (priority connector — sample fixture + schema docs in `samples/feeds/`), then Resale Online, then Generic XML. Use **streaming SAX parser** (sax / node-xml-stream) — never load full feed in memory; production feeds reach 100+ MB. Worker BullMQ jobs (sync + per-image download with content-hash dedup per §5.1). Field-level lock UI. Per-connection ON/OFF. Run history + error log UI. Manual XML upload. Super-admin maintains `KyeroType → PropertyTypeId` mapping table; unmatched towns/types route to DRAFT with alert.

### Sprint 6 — Viewing + Deals + Chat (3 weeks)
ViewingRequest + Deal schemas. Workflow: request → accept/decline/reschedule → outcome → handshake. Encrypted client info. Socket.io chat. ChatThread + ChatMessage. WhatsApp + email handoff buttons. Notifications (in-app + email digest via Resend).

### Sprint 7 — Billing + plan-gating (2 weeks)
Stripe Checkout + Customer Portal. Webhooks + ProcessedStripeEvent. Plan tier enforcement helpers. Manual grant UI. Stripe Tax + reverse-charge for VAT IDs. Activate PUBLIC visibility for paid agencies.

### Sprint 8 — Marketing (3 weeks)
AgencyEmailConfig + AgencyEmailDomain. DKIM verification UI. EmailTemplate CRUD. EmailCampaign create/schedule/send + per-recipient tracking. Bounce + EmailSuppression. Open/click tracking. FeaturedListing + admin curation + public-page rendering.

### Sprint 9 — Tickets + Audit log (1 week)
Ticket + TicketMessage + UIs. R2 attachments. Super-admin queue. AuditLog wired in. Audit log viewer.

### Sprint 10 — Webhooks (2 weeks)
Webhook* schemas. Event emission hooks at every relevant point. Worker: deliver + retry + dead-letter. Agency endpoint config UI. Super-admin delivery view + manual replay.

### Sprint 11 — Export (1-2 weeks)
Export schema + worker. CSV generator. PDF brochure / portfolio templates (Puppeteer + Handlebars). R2 + signed download links + 7-day expiry.

### Sprint 12 — Pressure test + launch prep (2 weeks)
Seed 15M synthetic properties. k6 baselines. Postgres tuning + index review. Better Stack / Uptime Robot. DR drill (restore from backup). GDPR pages (privacy/terms/cookie consent). robots.txt + sitemap validation.

**Full v1**: ~22-28 weeks solo. **Descope to ~14-18 weeks**: defer Webhooks, Featured listings, PDF Export, Custom email domain DKIM, full Audit log to v1.5.

---

## 13. RISKS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Single VPS = SPOF | Med | High | Nightly DB→R2 + rebuild runbook; warm-standby at Phase 3 |
| Postgres bloat at 150M-property scale | High eventually | High | Partitioning ADR before Phase 2; `pg_stat_statements` from day 1 |
| Meilisearch RAM ceiling | Med | Med | Adapter ready for OpenSearch / Typesense Cloud swap |
| Image storage cost growth | High | Med | R2 zero egress but storage real; lifecycle for soft-deleted media |
| Solo dev burnout / scope creep | High | High | Strict sprint discipline; descope Webhooks + Featured if behind |
| GDPR violation | Low | Critical | Encryption at rest, audit log, DPA template, lawyer review |
| Public marketplace SEO penalty | Med | Med | hreflang + canonical + structured data + sitemap; redirect not 404 |
| Stripe Tax mis-setup | Med | Med | Stripe Tax (auto); test EU + UK + non-EU in test mode |
| Email deliverability (per-agency SMTP) | High | Med | Setup guide; auto SPF/DKIM/DMARC checks; auto-suppress bouncers |
| Webhook DDoS via slow agency endpoints | Low | Med | 10s timeout, retry+backoff, dead-letter; never block on delivery |

---

## 14. VERIFICATION

### Per-sprint
E2E manual smoke test on the new flow. Playwright E2E for critical flows (login, property create, viewing request, checkout). Lighthouse ≥ 90 on public pages. TypeScript strict, no `any` in new code. Prisma migration validates against existing data.

### Pre-launch (after Sprint 12)
All k6 thresholds met (p95 < 300ms dashboard / < 500ms public). Restore-from-backup drill successful. 100 test agencies + 100K test properties seeded; manual UX verification. Stripe webhooks tested end-to-end in test mode. GDPR data export + erasure flows verified. Public site indexed in Google Search Console. Cookie consent + privacy + terms pages live and lawyer-reviewed. Cloudflare WAF rules active.

### Post-launch metrics
DB connections + CPU + slow queries + replication lag. API p95 latency + error rate + 5xx + queue depth. Email bounce + suppression growth + complaint rate. Stripe failed-payment rate + churn. Public traffic + top-keyword rank + organic CTR. Sentry error volume + regression rate per deploy.

---

## 15. STATUS

All foundation locked. All 13 modules locked. ~50 Prisma models inventoried in §10. Ready for Sprint 0.

### Sprint 0 — first actions (before any code)

In `E:\Repos\Inmolink\`:

```
Step 1 (docs only, no code):
├── PLAN.md                  ← copy of this plan at repo root
├── README.md                ← project overview
├── CLAUDE.md                ← living instructions for Claude
├── ARCHITECTURE.md          ← high-level overview + diagrams
├── CHANGELOG.md             ← Keep-A-Changelog format
├── TROUBLESHOOTING.md       ← issue → root cause → fix log
├── .gitignore
└── docs/
    ├── adr/0001-stack-choice.md   ← ADR documenting the locked stack
    └── runbooks/                  ← (empty for now)

Step 2: git init + first commit "docs: initial plan and architecture"
Step 3: monorepo scaffold (turbo + pnpm + apps/* + packages/* skeletons)
Step 4: docker-compose.yml for Postgres + Redis + Meilisearch
Step 5: prisma init + tenancy schema
Step 6: Auth.js v5 + email verification + password reset
Step 7: First deploy to VPS via SFTP/rsync (smoke test "Hello World" behind login)
```

Only after Step 1 docs + ADR exist do we touch code. Project memory continues to live at `C:\Users\Shah PC\.claude\projects\E--Repos-Inmolink\memory\` (Claude's user-level memory) — no project-level memory folder.
