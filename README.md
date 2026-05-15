# Inmolink

Multi-agent real-estate marketplace for EU agencies.

All agents share one dashboard, see each other's listings, can request viewings on each other's properties, and split commissions when a deal closes (default 5% / 50% to introducer, configurable per agency, settled outside Inmolink). Plus a public buyer-facing marketplace with multi-language support (EN / ES / DE / FR).

## Status

**v1 feature-complete.** Sprints 0–12 closed in code. Now in **pre-deploy
hardening** — security review fixes (`docs/reviews/`) are being burnt down
before the first VPS rollout. **Not yet production-deployed.**

See [CHECKLIST.md](./CHECKLIST.md) for the gating checklist and
[docs/reviews/claude-master-fix-list-2026-05-12.md](./docs/reviews/claude-master-fix-list-2026-05-12.md)
for the open-issue list driving this phase.

## Quick links

- [PLAN.md](./PLAN.md) — Full architecture, decisions matrix, sprint roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — High-level overview + diagrams
- [CHANGELOG.md](./CHANGELOG.md) — Notable changes (Keep-A-Changelog)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Issue → root cause → fix log
- [docs/adr/](./docs/adr/) — Architecture Decision Records
- [CLAUDE.md](./CLAUDE.md) — Living instructions for Claude Code sessions

## Stack at a glance

- pnpm + Turborepo monorepo
- `apps/web` Next.js 15 (auth dashboard) | `apps/public` Next.js 15 (anonymous marketplace) | `apps/api` Fastify | `apps/worker` BullMQ
- PostgreSQL 16 + Prisma | Redis 7 + BullMQ | Meilisearch
- Auth.js v5 | Socket.io | Cloudflare R2 | Stripe (subscriptions only)
- TypeScript strict end-to-end | Zod everywhere | next-intl (4 locales)

## Local development

### Prerequisites

- Node 20+ (use `.nvmrc` — `nvm use` or fnm)
- pnpm 10.33+ (Corepack: `corepack enable && corepack prepare pnpm@10.33.2 --activate`)
- Docker + Docker Compose (for the local Postgres / Redis / Meilisearch stack)

### First-time setup

```bash
# 1. Install dependencies (12 workspace packages)
pnpm install

# 2. Start the local infra stack (Postgres + Redis + Meilisearch + PgBouncer)
docker-compose up -d

# 3. Copy env templates — fill in any missing values (most defaults work for local)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/public/.env.example apps/public/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env

# 4. Generate Prisma client + run migrations + seed
pnpm db:generate
pnpm db:migrate:dev    # creates the schema in your local Postgres
pnpm db:seed           # plans + super-admin agency-of-one

# 5. (Optional, one-time) Download the Chrome binary Puppeteer uses for
# PDF generation. Skip if you never plan to test the brochure / portfolio
# export feature locally; the CSV export and everything else work without it.
pnpm --filter @inmolink/pdf exec puppeteer browsers install chrome

# 6. Start everything in dev mode (turbo runs all apps in parallel)
pnpm dev
```

Once `pnpm dev` is up:

- Agent dashboard: http://localhost:3000
- Public marketplace: http://localhost:3002
- API + OpenAPI docs: http://localhost:3001/docs
- Meilisearch: http://localhost:7700
- Prisma Studio: `pnpm db:studio` (browser DB explorer)

### Useful commands

```bash
pnpm lint           # Biome check
pnpm lint:fix       # Biome fix
pnpm format         # Biome format only
pnpm typecheck      # tsc --noEmit across all workspaces
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright E2E (when set up in Sprint 12)
pnpm build          # Production build of every app
pnpm clean          # Wipe build outputs (turbo + .next + dist)

# DB workflows
pnpm db:generate            # regenerate Prisma client after schema edits
pnpm db:migrate:dev         # create + apply a new migration in dev
pnpm db:migrate:deploy      # apply pending migrations in prod
pnpm db:studio              # browse DB visually
pnpm db:seed                # rerun the seed script
```

### Working with the Kyero sample

The fixture at `samples/feeds/kyero-sample.xml` (3.4 MB, 270 properties) is the
primary unit-test input for the Kyero connector (Sprint 5). See
`samples/feeds/README.md` for schema + 10 implementation notes.

## License

Proprietary.
