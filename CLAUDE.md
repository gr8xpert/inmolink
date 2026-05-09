# Claude instructions for Inmolink

> Living document. Updated as the codebase evolves. **Read this first when joining a new session.**

## Source of truth

**[PLAN.md](./PLAN.md)** is the canonical specification. Every architectural decision is locked there. If a request seems to conflict with PLAN.md, surface the conflict before deviating.

## Project overview

Multi-agent real-estate marketplace for EU agencies. Solo developer, vibe-coded with Claude Code. v1 in progress. Designed for 500 → 5,000 agents, 20-30K properties each, ~50 images per property → 150M-property / 7.5B-image ceiling.

Inspired by SPW (E:\Repos\SPW-AI\spw\PROJECT_OVERVIEW.md) but fundamentally different in tenancy + scale + payments. Don't copy SPW patterns blindly — many were flagged as weaknesses in SPW's own overview (TypeORM, MySQL, single PM2, no tests).

## Stack (locked — PLAN.md §0, §3)

- **Monorepo**: pnpm + Turborepo
- **`apps/web`** Next.js 15 App Router (auth dashboard)
- **`apps/public`** Next.js 15 (anonymous marketplace, ISR/SEO)
- **`apps/api`** Fastify (sockets, webhooks, heavy endpoints)
- **`apps/worker`** BullMQ workers
- **`packages/db`** Prisma + PostgreSQL 16 (self-hosted on VPS)
- **`packages/shared`** Zod schemas + types + i18n strings
- **`packages/search`** Meilisearch adapter (swap-ready interface)
- **`packages/auth`** Auth.js v5 + permission helpers
- **`packages/ai`** Claude Haiku icon suggester + translation drafts
- **`packages/imports`** Kyero (priority) / Resale Online / Generic XML connectors
- **`packages/pdf`** Puppeteer + Handlebars
- **`packages/ui`** shadcn components

**Real-time**: Socket.io (Redis adapter from day 1). **Storage**: Cloudflare R2. **Payments**: Stripe subscriptions only (no Connect). **Email**: per-agency SMTP + Resend platform. **Image**: sharp (WebP variants only + 1 JPEG fallback for og:image). **Process manager**: PM2 cluster. **Reverse proxy**: Nginx. **CI**: GitHub Actions → SFTP/rsync.

## Tooling rules

- Always invoke Context7 before writing code against any external library. Resolve the library ID and fetch current documentation rather than relying on training-data knowledge.
- If a specific version is pinned in `package.json`, fetch docs for that version.

## Code conventions

- TypeScript strict mode, **no `any`** in new code
- Zod schemas for every endpoint input + every API response that crosses a boundary
- Prisma parameterized queries only — no raw SQL string concatenation (use `$queryRaw` with template-tagged literals when needed)
- **Argon2id** for password hashing (not bcrypt)
- AES-256-GCM for all secrets at rest: SMTP creds, Stripe keys, import credentials, webhook secrets, TOTP secrets, encrypted client info on ViewingRequest
- Pino structured logs with request-id correlation + PII redaction
- 4 locales (en/es/de/fr) — every translatable string flows through next-intl
- Cursor pagination on every list endpoint — **never use `OFFSET`** on hot lists
- All BullMQ jobs idempotent by design
- All public endpoints have rate limits (Redis-backed)
- Property visibility filter applied in **every** read query touching properties
- Plan-tier gates via `can(user, 'feature:X')` — middleware returns 403 with `{ error: 'PLAN_REQUIRED', requiredTier: 'PRO' }`

## Documentation lookup (mandatory)

Use **Context7 MCP** to fetch current library docs before writing code that touches:

- Next.js 15, React 19
- Prisma, PostgreSQL extensions
- Fastify, NestJS (if ever)
- Auth.js v5
- Stripe, Stripe Tax
- BullMQ, Redis
- Meilisearch
- Cloudflare R2 SDK (`@aws-sdk/client-s3` against R2)
- Socket.io
- sharp, Puppeteer
- next-intl
- Resend
- shadcn/ui, Radix UI

Do not rely on training-data knowledge — APIs change. If a specific version is pinned in `package.json`, fetch docs for that version.

## Always

- Update **`CHANGELOG.md`** for every notable change (Keep-A-Changelog format, append to `[Unreleased]`)
- Log every solved bug in **`TROUBLESHOOTING.md`** (issue → root cause → fix → prevention)
- Create an **ADR** (`docs/adr/NNNN-title.md`) for any new architectural decision or scale-out trigger
- Read **memory** at session start: `C:\Users\Shah PC\.claude\projects\E--Repos-Inmolink\memory\` (especially `inmolink_state.md` for resume readiness)
- Run `pnpm typecheck` and `pnpm lint` before committing
- Update **`PLAN.md`** when locking new architectural decisions (don't let memory drift from the plan)
- Reference PLAN.md sections in commit messages when relevant (e.g. "feat(properties): add MediaObject dedup per PLAN §5.1")

## Never

- Don't add **listing-count limits** to plan tiers — only feature gates allowed (PLAN §6)
- Don't proxy big files (videos, original images) through the API — always direct browser → R2 signed URL
- Don't 404 deleted public property pages — always **301** to similar listing or "withdrawn" page (SEO penalty otherwise)
- Don't store SMTP / Stripe / import credentials in plaintext — always AES-256-GCM
- Don't skip the dispute window on Deal confirmation — both agents must confirm
- Don't use `OFFSET` on hot list queries (Property, ChatMessage, AuditLog) — always cursor-paginate
- Don't introduce a new ORM, query builder, or DB driver without an ADR
- Don't hardcode locale strings in UI — every user-facing string goes through next-intl
- Don't bypass `can(user, action)` checks — even super-admin actions get audit-logged
- Don't load whole XML feeds into memory — Kyero/Resale feeds can be 100+ MB; **use streaming SAX parser** in the imports package
- Don't store images/videos as DB blobs — R2 only

## Folder discipline

- Module code lives in `apps/<app>/src/modules/<module-name>/` with `controllers/`, `services/`, `repository.ts`, `dto/`, `*.test.ts`
- Each module is self-contained — cross-module access only through public service exports, never reach into `repository.ts` from another module
- Schema lives in `packages/db/prisma/schema.prisma` — split into per-module sections via comments
- Shared Zod types live in `packages/shared/src/schemas/<module>.ts`

## Module roadmap (PLAN.md §12)

Sprint 0 → Foundation. Sprint 1 → Properties. Sprint 2 → Locations / Types / Features. Sprint 3 → Public marketplace. Sprint 4 → Agencies + Profiles + 2FA. Sprint 5 → Imports (**Kyero first**). Sprint 6 → Viewing + Deals + Chat. Sprint 7 → Billing + plan-gating. Sprint 8 → Marketing. Sprint 9 → Tickets + Audit log. Sprint 10 → Webhooks. Sprint 11 → Export. Sprint 12 → Pressure test + launch.

## Scale targets reminder

500 → 5000 agents. 20-30K properties each. 50 images + video + floor plan per property. **150M properties / 7.5B image objects / ~15PB media at ceiling.** Single VPS for v1 → phased scale-out per PLAN §7. Every design decision must survive the ceiling.

## Sample fixtures

- `samples/feeds/kyero-sample.xml` — real production Kyero feed (270 properties). See `samples/feeds/README.md` for schema docs + connector implementation notes. **Use as primary unit-test fixture for the Kyero connector.**

## When uncertain

Ask before assuming. Pick smallest reversible step. Document the trade-off in an ADR if the choice has long-term consequences.
