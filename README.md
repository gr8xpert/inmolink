# Inmolink

Multi-agent real-estate marketplace for EU agencies.

All agents share one dashboard, see each other's listings, can request viewings on each other's properties, and split commissions when a deal closes (default 5% / 50% to introducer, configurable per agency, settled outside Inmolink). Plus a public buyer-facing marketplace with multi-language support (EN / ES / DE / FR).

## Status

In active development. v1 in progress (Sprint 0 — Foundation).

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

(To be populated during Sprint 0.)

## License

Proprietary.
