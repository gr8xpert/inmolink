# Inmolink Architecture

> High-level overview. Source of truth for decisions: [PLAN.md](./PLAN.md). ADRs document specific decisions: [docs/adr/](./docs/adr/).

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Public visitors (anonymous, EU)         Agents (auth, EU)       │
│  Browse marketplace, submit inquiries    Manage listings, chat   │
└────────┬─────────────────────────────────────────┬───────────────┘
         │                                         │
         ▼                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare — DNS / CDN / WAF / R2 (free tier)                   │
│  HTML edge cache (s-maxage), DDoS shield, full SSL, Turnstile    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│   VPS — Ubuntu 22.04+, 24-core / 128GB / NVMe                    │
│   Nginx (TLS, reverse proxy, sticky sessions for WebSocket)      │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  apps/web    │  apps/public │   apps/api   │  apps/worker       │
│  Next.js 15  │  Next.js 15  │  Fastify     │  BullMQ            │
│  (auth)      │  (ISR / SEO) │  (sockets,   │  (variants,        │
│  PM2 ×2-4    │  PM2 ×2-4    │   webhooks)  │   imports, email)  │
│              │              │  PM2 ×2-4    │  PM2 ×2            │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│   PgBouncer (transaction pool)                                    │
│         ↓                                                          │
│   PostgreSQL 16                                                    │
│   ├─ primary (writes)                                              │
│   └─ logical replica (reads, public marketplace + dashboard reads) │
│                                                                    │
│   Redis 7    — cache + BullMQ broker + sessions + Socket.io adapter│
│   Meilisearch — per-locale indices (en/es/de/fr)                   │
└──────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare R2 (S3-compatible)                                    │
│  Content-addressable: objects keyed by SHA-256 (PLAN §5.1)        │
│  All media: images, videos, floor plans, exported PDFs, sitemaps  │
│  Direct browser → R2 signed-URL upload (no API proxy)             │
└──────────────────────────────────────────────────────────────────┘
```

## Apps & responsibilities

| App | Purpose | Traffic profile |
|---|---|---|
| `apps/web` | Authenticated agent dashboard. CRUD on properties, viewing requests, chat, settings, super-admin. | Lower volume, mutating-heavy, every request authenticated. SSR + Server Actions for forms. |
| `apps/public` | Anonymous buyer-facing marketplace. Property search + detail + location landing pages + agency/agent profiles. | High volume, read-only, ISR-aggressive, CDN-cached at edge. |
| `apps/api` | Heavy / shared endpoints: file uploads, Stripe webhooks, Socket.io chat, search, import triggers, internal cross-app RPC. | Mixed, includes long-lived WebSocket connections. |
| `apps/worker` | Async jobs via BullMQ: image variant generation, feed imports (Kyero priority), email sends, PDF rendering, webhook delivery, sitemap generation, Meilisearch reindex via outbox pattern. | Backend-only, no public exposure. |

## Modules (13)

Each module is self-contained: own folder under `apps/<app>/src/modules/<module>/` with controllers + services + repository + DTOs. Cross-module access only via public service exports.

1. **Properties** — listings, ownership, visibility (PRIVATE/SHARED/PUBLIC), media references, soft-delete (30d → hard delete), translations
2. **Locations** — super-admin-curated 4-level hierarchy (COUNTRY → REGION → CITY → AREA), m2m groups, drag-n-drop, centroid lat/lng
3. **Property Types & Features** — super-admin-curated, grouped, AI-suggested icons (Claude Haiku), translations
4. **Imports** — Kyero (priority) / Resale Online / Generic XML connectors; per-agent encrypted credentials; per-connection ON/OFF; field-level locks; cron via BullMQ repeatable jobs
5. **Agencies** — rich profile (logo/banner/hero/socials), invite-only joining, public profile pages, per-agency settings (commission defaults, viewing response days)
6. **Viewing Requests + Deals** — agent-to-agent viewing requests on cross-visible properties; encrypted client info; handshake deal confirmation; tracked-only commission split (no money flow through Inmolink); super-admin dispute resolution
7. **Chat** — Socket.io (Redis adapter); VIEWING-pinned threads + free-form DIRECT 1:1; offline-recipient email digest 5-min debounce; WhatsApp + email handoff buttons (deep-link only)
8. **Marketing** — full SPW email toolkit (campaigns, templates, per-agency SMTP, custom email domain DKIM, suppressions) + Featured Listings — paid-gated
9. **Tickets** — agent → super-admin only, fixed enums, R2 attachments
10. **Billing** — Stripe subscriptions only (EUR + GBP, Stripe Tax + reverse-charge), super-admin manual grant; ProcessedStripeEvent idempotency
11. **Export** — CSV (Pro+), PDF brochure / portfolio (Pro+), Puppeteer rendered, R2-stored, 7-day signed URL expiry
12. **Settings** — user (profile, notifications, language, 2FA TOTP) + agency (branding, SMTP config, commission defaults, webhook endpoints)
13. **Super Admin** — agencies CRUD, users CRUD (impersonate audit-logged), plans, taxonomy curation, tickets queue, audit log, webhook delivery monitor + replay, queue depth, bulk ops, suppressions, translation gaps

See [PLAN.md §10](./PLAN.md) for the full ~50-model data inventory per module.

## Cross-cutting

- **Auth & permissions**: Auth.js v5 + `can(user, action, resource)` matrix. Plan-tier checks via `can(user, 'feature:X')`. Property visibility filter on every read query.
- **Internationalization**: 4 locales (en/es/de/fr) day-1. Per-locale Meilisearch indices. Per-locale sitemaps + hreflang. Locale-prefixed URLs via next-intl. AI translation drafts via Claude Haiku.
- **Storage**: R2 only for media. SHA-256 content-addressable with `MediaObject` table + refCount (PLAN §5.1, ADR 0002). Variants also dedup'd. WebP at 4 sizes + 1 JPEG fallback for og:image cover.
- **Search**: Meilisearch via outbox pattern (DB write → OutboxEvent → worker → Meili). Adapter interface in `packages/search` for swap to OpenSearch / Typesense Cloud later.
- **Caching**: Redis layers — taxonomy 1h / plan-tier 5m / listings 60s / facets 1m + in-process LRU for super-hot reads. Cloudflare HTML edge cache (s-maxage 300) for public pages.
- **Real-time**: Socket.io with Redis adapter. Sticky sessions in Nginx. Offline message queue via BullMQ.
- **Security**: Argon2id passwords. Helmet headers. CSP nonces. Strict CORS. Cookie httpOnly + Secure + SameSite=Lax. Cloudflare Turnstile on public forms. AES-256-GCM for secrets at rest.
- **Observability**: Sentry (errors + session replay free tier). Better Stack uptime + heartbeat. Pino structured logs with request-id + PII redaction. PM2 process monitoring.
- **Backups**: Nightly Postgres pg_dump → R2 (30-day lifecycle). R2's 11-nines durability for media. Meilisearch re-buildable from Postgres via `scripts/reindex.ts`. Restore drill quarterly.

## Data flow examples

### Public visitor browses a property
```
Browser → Cloudflare (HTML edge cache check)
       ↓ cache miss
       → apps/public (Next.js, ISR)
       → Postgres replica (read property + translations + agency + features)
       → Meilisearch (related properties)
       → Cloudflare R2 (signed image URLs)
       → render → cache at edge (s-maxage=300, swr=600)
       → Browser
```

### Agent uploads property images
```
Browser computes SHA-256 of each file
Browser → apps/api: "do you already have hashes [X, Y, Z]?"
       ← MediaObject IDs for matches; signed PUT URLs for new ones
Browser → R2 (direct PUT for new files)
Browser → apps/api: "register PropertyImage rows pointing at MediaObject IDs"
       → apps/api enqueues BullMQ job: variant generation (lazy: thumb + medium eager, small + large later)
       → apps/worker: sharp pipeline → upload variants to R2 (each variant also content-addressed)
       → Postgres: update PropertyImage with variant manifest
       → Outbox event → Meilisearch reindex
       → Cloudflare purge for affected pages
```

### Kyero feed import
```
BullMQ repeatable job (configured per FeedConnection) fires
apps/worker: streaming SAX parse of feed (sax / node-xml-stream)
       per <property>:
         → fuzzy-match town + province against Location table
         → upsert Property by (source=KYERO, externalRef=<ref>)
         → respect lockedFields on update (skip locked)
         → enqueue per-image download jobs with content-hash dedup
         → enqueue translation rows by locale
         → log per-item outcome to FeedRun.itemsLog
       FeedRun: aggregate counts, set status SUCCESS/PARTIAL/FAILED
       Webhook event: IMPORT_RUN_COMPLETED → all subscribed agency endpoints
```

## Scaling phases

Single VPS in Phase 0 (today). Migrations triggered as load grows — see [PLAN.md §7](./PLAN.md) for the full trigger matrix:

| Phase | Trigger | Action |
|---|---|---|
| 0 | day 1 | All on single VPS |
| 1 | DB CPU > 70% / p95 query > 200ms | Tune indexes, `pg_stat_statements` |
| 2 | DB still hot / >200 concurrent users | Replica → sibling VPS |
| 3 | DB box >80% disk / >1000 concurrent users | Postgres → managed (Neon / Crunchy) |
| 4 | Worker queue depth >1000 sustained | Workers → sibling VPS |
| 5 | Meilisearch RAM >8GB | Meili → sibling VPS or OpenSearch |
| 6 | High repeat-image traffic | Cloudflare Pro + Image Resizing |
| 7 | >3000 concurrent users + cross-region | Regional Postgres shards by country |

Every triggered migration becomes its own ADR.
