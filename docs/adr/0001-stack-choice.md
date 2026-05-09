# ADR 0001 — Stack choice for Inmolink v1

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: User (solo dev, owner)
- **Consulted**: Claude (research + recommendations during planning)
- **Supersedes**: —

## Context

Greenfield real-estate marketplace for EU agencies. Targets 500 → 5,000 agents, 20-30K properties each (15M-150M total), 50+ images per property + video + floor plans, multi-language (EN/ES/DE/FR), public marketplace + agent dashboard, real-time chat, Stripe subscriptions, GDPR.

Constraints: solo developer with Claude Code, single VPS (24-core / 128GB) for v1, ~$100/mo budget, greenfield user base, payments via Stripe only.

We considered alternatives across every layer:

- **Frontend**: Next.js 15 vs Remix vs SvelteKit vs Astro
- **Backend**: NestJS vs Fastify vs Hono vs Next.js Server Actions only
- **Tenancy split**: monolith Next.js vs split web + public + api
- **DB**: PostgreSQL 16 vs MySQL 8 vs SQLite
- **ORM**: Prisma vs Drizzle vs TypeORM vs Kysely
- **Search**: Postgres FTS vs Meilisearch vs Typesense vs OpenSearch
- **Real-time**: Socket.io vs native ws vs Pusher (paid) vs Ably
- **Payments**: Stripe vs Paddle vs LemonSqueezy
- **Media**: Cloudflare R2 vs AWS S3 vs Bunny vs self-hosted MinIO
- **Auth**: Auth.js v5 vs Lucia vs Clerk (paid) vs roll-our-own
- **Job queue**: BullMQ vs Inngest vs Trigger.dev (paid) vs Temporal

## Decision

| Concern | Choice | Rationale |
|---|---|---|
| Frontend framework | **Next.js 15 (App Router)** | Mature, AI-friendly codegen, Server Components + ISR + Server Actions cover both auth dashboard and SEO-heavy public marketplace. Two separate Next.js apps (web + public) for traffic isolation. |
| API backend | **Fastify** | Lighter than NestJS (~3× perf, ~10× faster cold start), modern ergonomics, first-class plugins, Socket.io integrates cleanly. NestJS rejected as too heavy for solo + Fastify gives us the few features we need (decorators via plugins, validation via Zod). |
| App split | **`apps/web` + `apps/public` + `apps/api` + `apps/worker`** | Public traffic (anonymous, ISR-heavy) and dashboard traffic (auth, mutating) have different perf profiles; separating them lets each scale independently. Fastify api hosts heavy endpoints + Socket.io + Stripe webhooks. Worker runs BullMQ. |
| ORM | **Prisma** | Best AI codegen + ecosystem; adequate perf at our scale; clean migration story; `$queryRaw` for the few hot paths where Prisma's plan is suboptimal. Drizzle considered (better SQL control, lighter) — rejected for now because Prisma's training-data depth makes it more AI-friendly for solo dev. |
| Database | **PostgreSQL 16** | Declarative partitioning (mandatory at 150M-property scale), JSONB indexing (lockedFields, audit metadata, webhook payloads), MVCC concurrency, `pg_stat_statements`, PostGIS available later. Self-hosted on VPS. SPW's overview itself flagged MySQL as a weakness ("MySQL over PostgreSQL..."). |
| Connection pooling | **PgBouncer** (transaction pooling) | 1000s of app connections → ~50 actual Postgres connections. Standard pattern at our concurrency. |
| Read replica | **Logical replication from day 1** (same VPS initially) | Decouples read+write scaling immediately. Public marketplace + dashboard reads route to replica; mutations to primary. Migrating replica off-box at Phase 2 is a config flip, not a rewrite. |
| Search | **Meilisearch** (adapter-isolated) | Single binary, low RAM, excellent for faceted real-estate search, instant search suggestions, geo-radius queries. `packages/search` adapter ready to swap to OpenSearch / Typesense Cloud later. Postgres FTS rejected as insufficient at 15M+ rows + faceted real-estate UI. |
| Cache / queue | **Redis 7 + BullMQ** | Same as SPW, proven; BullMQ handles imports, image variants, email sends, webhook deliveries with retry + dead-letter. Self-hosted. Inngest / Trigger.dev rejected as paid SaaS. |
| Auth | **Auth.js v5** | Strongest ecosystem, Next.js native; covers password + email verification + 2FA TOTP. Lucia rejected (smaller ecosystem). Clerk rejected (paid). |
| Real-time | **Socket.io (in apps/api)** | Free, mature, great browser support, integrates with BullMQ for offline-recipient digest emails. Redis adapter from day 1 for horizontal scaling readiness. Pusher / Ably rejected (paid). |
| Payments | **Stripe subscriptions only** | No Stripe Connect: commission flow is tracked-only (settled outside Inmolink), removing money-licensing risk and Connect complexity entirely. Stripe Tax for EU VAT MOSS + reverse-charge for valid VAT IDs. Paddle rejected (overkill for one currency model). |
| Email — platform | **Resend** | Transactional emails (verification, password reset, notifications). 3K/mo free → $20/mo. Modern API. |
| Email — tenant | **Per-agency custom SMTP** | Each agency configures their own mail server in settings. They own deliverability + branding + sending limits. Matches SPW pattern. |
| Storage | **Cloudflare R2** | No egress fees critical at 7.5B-image ceiling. S3-compatible API. Free tier covers v1 (10GB). Direct browser → R2 signed-URL upload (no API proxy). Content-addressable dedup via SHA-256 (see ADR 0002). |
| CDN / DNS / WAF | **Cloudflare free tier** | Free CDN edge cache, free WAF, free DDoS shield, full SSL, HTTP/3, Brotli. Turnstile (free reCAPTCHA replacement) on public forms. |
| Image processing | **sharp** | Worker-side WebP variant generation (4 sizes); +1 JPEG at large size for og:image cover only. AVIF dropped (marginal compression gain not worth encoder cost + 50% extra storage at 7.5B images). |
| AI services | **Anthropic Claude Haiku** | Icon suggestion (PropertyType / Feature) + AI translation drafts (EN → ES/DE/FR) + AI property description writer (paid feature) + AI search query parsing. Cheapest tier suitable for these cases. AI alt-text deferred (agents enter manually). |
| PDF generation | **Puppeteer + Handlebars** | Worker-side render of HTML templates → PDF for property brochures + portfolio exports. R2-stored, 7-day signed URL expiry. |
| Process manager | **PM2 cluster mode** | Same as SPW, mature, log rotation, graceful reload. Each app gets PM2 instances. |
| Reverse proxy | **Nginx** | TLS termination, static file serving, sticky sessions for WebSocket upgrade, Brotli compression. |
| CI / CD | **GitHub Actions → SFTP/rsync** | Solo dev, single VPS — heavy CI/CD platforms (Vercel, Render, Fly) are overkill and most can't host the worker + Postgres + Redis + Meilisearch on the same box at our budget. SFTP/rsync deploy matches SPW practice. |
| Observability | **Sentry + Better Stack** (free tiers) | Sentry for errors + session replay (~50 free/mo). Better Stack for uptime + heartbeat. Grafana + Prometheus deferred to Phase 3+. |
| Monorepo | **pnpm + Turborepo** | Same as SPW, fast install, well-supported, remote cache available later. |
| Languages | **TypeScript end-to-end** | Zod schemas + Prisma types share across web/public/api/worker via `packages/shared`. |
| Linter / formatter | **Biome** | Single tool replaces ESLint + Prettier, ~10× faster, fewer config files. |
| Test runner | **Vitest** + **Playwright** + **MSW** | Vitest for unit (modern, ESM-native, faster than Jest). Playwright for E2E. MSW for API mocking. |
| Password hashing | **Argon2id** | Modern OWASP recommendation, replaces bcrypt. Trivial swap, better security. |
| API contract | **OpenAPI auto-generated** from Fastify routes (`@fastify/swagger`) | Frontend codegen typed client; documentation always current. |
| UI components | **shadcn/ui** + **Tailwind** + **Radix UI** | Copy-paste components, zero runtime cost. MUI / AntD rejected (heavy bundles). |
| Forms | **React Hook Form** + **Zod** | Same as SPW, well-known, AI-friendly. |
| State (client) | **Zustand** + **React Query** | Same as SPW, proven combination. |

## Consequences

### Positive

- Familiar SPW-aligned patterns where they made sense (Redis + BullMQ + PM2 + Nginx + Turborepo + per-tenant SMTP).
- AI-friendly stack: Next.js 15 + Prisma + Zod + shadcn + Auth.js have deep training-data coverage → solo+Claude productivity is high.
- Avoids SPW pain points explicitly listed in its own overview: TypeORM → Prisma, MySQL → Postgres, single Next.js app → split web/public for traffic isolation, polling → WebSocket, hard tenant isolation → flexible visibility tiers.
- Fits in $100/mo budget on one VPS for v1.
- Adapter-isolated search lets us swap engines without rewriting callers.
- Read replica from day 1 + PgBouncer + cursor pagination + dedup = ready for the 150M-property ceiling.

### Negative / trade-offs

- More moving parts than a Next.js-full-stack monolith (4 apps to deploy via PM2). Mitigated by `docker-compose.prod.yml` orchestrating everything as one unit.
- Postgres learning curve for an MySQL-experienced developer. Mitigated by Prisma abstracting most syntax differences + heavy use of `pg_stat_statements` for tuning.
- Self-hosted Postgres + Redis + Meilisearch on one VPS = single point of failure. Mitigated by nightly DB→R2 backups + documented rebuild runbook + Phase 2 trigger to move replica off-box.
- Webhook event catalog (full retry + dead-letter + replay) is significant scope for a solo dev. Tagged for descope to v1.5 if velocity slips (PLAN.md §12).
- Per-agency SMTP adds support burden vs platform Resend for everyone. Justified because deliverability + branding belong to the agency, not Inmolink.
- Stripe Tax adds ~0.5% transaction fee. Justified because manual EU VAT MOSS reporting is painful and error-prone for a solo operator.
- AVIF dropped: ~10-20% compression gain vs WebP but doubles encoding cost and adds an extra variant per image. At 7.5B images the storage + compute cost dominates the bandwidth gain. Re-evaluate at Phase 6 (Cloudflare Image Resizing).

### Open

- Pricing for Pro tier (separate session — pricing TBD per PLAN.md §6).
- Whether to add additional locales (e.g., IT, NL, PT) post-v1 once we know the user base.
- Whether to migrate to managed Postgres at Phase 3 (Neon vs Crunchy vs Supabase vs dedicated Hetzner Cloud Postgres).
- Whether `apps/public` belongs on Cloudflare Pages instead of the VPS at scale (edge SSR vs origin SSR).

## Related

- [PLAN.md](../../PLAN.md) §0 (Executive Summary), §1 (Decisions Matrix), §3 (Auth), §6 (Plan Tiers), §7 (Scaling Phases), §10 (Data Model), §11 (Performance & Optimizations)
- [ADR 0002](./0002-storage-deduplication.md) — Storage deduplication via content-addressable R2
