# Changelog

All notable changes to Inmolink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version `0.0.0` covers the planning phase (no shipped code yet). Sprint 1 will produce the first tagged release.

---

## [Unreleased]

### Added

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
