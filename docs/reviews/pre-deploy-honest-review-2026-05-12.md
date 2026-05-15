# Inmolink Pre-Deploy Honest Review

Date: 2026-05-12  
Reviewer: Codex  
Scope: repository-level production-readiness review before first VPS deployment and real-data testing.

## Executive verdict

Inmolink is a serious, unusually complete v1 for a solo-built marketplace. The architecture is not a toy: the repo has a real monorepo layout, bounded app/package ownership, Prisma-backed tenancy, Auth.js, BullMQ workers, Socket.io, R2 storage, Meilisearch, billing, imports, audit logs, exports, webhooks, runbooks, ADRs, and load-test scaffolding. The project clearly aims at the right long-term problems: multi-tenancy, media scale, direct-to-object storage, cursor pagination on public surfaces, search isolation, idempotent workers, and plan gates.

My honest review is that the codebase is close to being a strong staging candidate, but it is not ready for real customer data or a public production launch yet. The risk is not that the project is weak. The risk is that v1 is broad: it shipped many high-impact modules, and several integration/security edges are still thin. A first deploy should be treated as a hardening sprint, not a launch.

## What looks strong

- The locked stack in `PLAN.md` is mostly reflected in the codebase: Next.js apps, Fastify API, BullMQ worker, Prisma/PostgreSQL, Meilisearch adapter, R2-compatible storage, Auth.js, Stripe, Socket.io, Puppeteer PDF, and shared Zod schemas.
- The app boundaries are sane. Public marketplace, dashboard, API, workers, shared schemas, auth, imports, storage, search, pdf, and ui are split in ways that can scale.
- The project has better operational thinking than many v1s: runbooks, PM2/Nginx config, CI workflow, env examples, seed scripts, k6 scripts, ADRs, troubleshooting notes, and a very detailed checklist.
- Media handling is directionally right: content-addressed objects, dedup, ref counts, R2, generated variants, and direct browser-to-storage upload are the right foundations for the stated image scale.
- Public property reads re-check database visibility/status after search results, which is good defense-in-depth against search index lag.
- Worker jobs generally show idempotency awareness and deterministic job IDs.
- Prisma validation, Biome, app builds, and package-level TypeScript checks are passing in this local review.
- There are meaningful security choices already present: Argon2id, AES-GCM helpers, Pino redaction intent, plan-tier errors, webhook signatures, and JSON-LD escaping work already recorded in the changelog.

## Main concern

The main concern is integration hardening. Several bugs only show up when the apps are split across real production origins, real webhooks are user-configurable, real imports fetch arbitrary vendor media, and real users handle passwords and 2FA. Local development can pass while production breaks because localhost hides subdomain cookie behavior, env injection, PM2 readiness, Nginx route mismatches, and missing public/app URL separation.

The biggest blockers I found are:

- 2FA login currently round-trips the plaintext password in the URL query string.
- The production seed path can create a default super-admin account if used unchanged.
- Auth cookies are host-only while the API and Socket.io are intended to run on a separate subdomain.
- Socket.io chat thread rooms are documented/client-emitted but not handled server-side.
- User-configured webhook delivery has SSRF risk.
- Upload and import media paths trust declared/header MIME too much.
- Dashboard property list visibility leaks same-agency private properties to ordinary agents.
- Public property detail returns exact latitude/longitude despite comments saying exact location is stripped.
- PM2/env/runbook wiring has several deploy-breaking mismatches.

Those are fixable, but they are pre-real-data fixes.

## Verification performed

Commands attempted or run locally:

- `git status --short`
- `rg --files`
- `pnpm lint` failed because `pnpm` was not on PATH.
- `corepack pnpm lint` failed because Corepack tried to write under the user profile and hit sandbox permissions.
- `.\node_modules\.bin\biome.cmd check .` passed 426 files with 1 warning.
- `.\node_modules\.bin\turbo.cmd run typecheck` failed because Turbo could not find the package manager binary.
- Package-level TypeScript checks passed for `apps/api`, `apps/worker`, `apps/web`, and `apps/public` using `tsc --noEmit --incremental false`.
- Unit tests passed for `apps/api`, `packages/auth`, `packages/storage`, and `packages/imports`.
- `packages/db` Prisma schema validation passed.
- Production builds passed for `apps/api`, `apps/worker`, `apps/web`, and `apps/public`.

Build caveat: `apps/public` completed successfully but logged multiple `fetch failed` / `ECONNREFUSED` warnings after the route table, likely from static/ISR fetches when no local API was listening. That should be tested against a real staging API before launch.

## Documentation state

The project has documentation drift:

- `CHECKLIST.md` says all 12 sprints are complete and v1 build is complete.
- `README.md` still says v1 is in progress at Sprint 0.
- `PLAN.md` still says ready for Sprint 0.
- Memory says v1 is ready for first VPS deploy.

For deploy work, I would treat `CHECKLIST.md` as the current completion record and `PLAN.md` as the canonical architecture, then update `README.md` and the status section of `PLAN.md` so future work does not start from stale assumptions.

## Deploy recommendation

Do not deploy with actual customer data yet. First fix the P0/P1 items in `docs/reviews/pre-deploy-issues-for-claude-2026-05-12.md`, then deploy a private staging environment with:

- non-public DNS or basic auth/VPN,
- no real Stripe live mode until callback URLs are verified,
- no real customer passwords until the 2FA flow is fixed,
- a small actual Kyero feed from a trusted agency,
- logs monitored closely for worker/import/media/webhook failures.

After the P0/P1 fixes, the project is a good candidate for a staging burn-in. Let it ingest real-but-controlled data, exercise imports, media variants, public search, dashboard edits, viewing/deal/chat flow, billing test mode, email delivery, and backup/restore before public launch.

## Bottom line

This is not a throwaway prototype. It has a solid backbone and a lot of thoughtful scale-aware work. But the next professional step is not adding more features. The next step is hardening the dangerous edges, making deployment deterministic, and forcing the system through real-origin, real-data, real-worker behavior.

If the fixes in the companion issue file are handled carefully, Inmolink can move from "impressive v1 build" to "credible staging system" quickly.
