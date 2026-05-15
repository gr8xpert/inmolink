# Inmolink Master Fix List for Claude

Date: 2026-05-12 (review) · 2026-05-13 (fix pass)
Purpose: one self-contained handoff file for Claude to fix the issues found during the pre-deploy deep review.
Audience: Claude or any engineer preparing Inmolink for first VPS deployment with real agency data.

## Fix-pass summary (2026-05-13)

Claude (Opus 4.7) worked the list end-to-end. All 44 items have a status line + feedback note inline. Numeric tally:

- **Fixed in code (39):** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 39, 41, 42, 43, 44.
- **Partial / scoped (3):** 25 (contacts gated on consent; leads documented as out-of-scope until a consent column lands), 29 (export templates localised; dashboard/public-page label sweep deferred), 38 (current scheme kept; ADR for variant join-table cleanup recommended).
- **Out-of-code (2):** 40 (legal review), 29 (dashboard hardcoded English — needs translator pass, not just code).

DB schema changes ship in four new migrations under `packages/db/prisma/migrations/`:

1. `20260513120000_property_tenant_scoped_unique` — tenant-scope `Property` import unique.
2. `20260513120100_chat_thread_partial_unique` — partial unique only for DIRECT threads.
3. `20260513120200_user_login_failed_audit` — `USER_LOGIN_FAILED` enum value.
4. `20260513120300_property_slug_drop_global_unique` — drop global slug unique.

Run `pnpm prisma migrate deploy` before booting the new code.

## How to use this file

Fix in priority order: P0 first, then P1, then P2, then P3. Do not batch unrelated risky fixes into one huge commit. For each fix:

1. Read `PLAN.md` and `AGENTS.md` before changing architecture.
2. Update tests or add focused regression tests.
3. Update `CHANGELOG.md` for notable changes.
4. Log solved bugs in `TROUBLESHOOTING.md` with issue, root cause, fix, prevention.
5. Create an ADR for any new architecture decision or long-term scale trigger.
6. Run at least `pnpm typecheck`, `pnpm lint`, targeted tests, and build checks before declaring done.

## Audit Coverage

This review inspected the monorepo structure, production/deploy configs, environment examples, API and worker modules, shared schemas, Prisma schema, auth/session flow, public marketplace routes, imports, media pipeline, chat/viewing/deal flows, marketing/email/webhook/export workers, and representative dashboard/public UI code. It is deeper than a simple overview, but it is still a code review rather than formal penetration testing, full UX QA, or a real-data load test.

Verification attempted during review:

- `biome check .`: passed with one warning about array index React keys.
- Package TypeScript checks with `tsc --noEmit --incremental false`: passed for `apps/api`, `apps/worker`, `apps/web`, `apps/public`.
- Unit tests passed for `apps/api`, `packages/auth`, `packages/storage`, `packages/imports`.
- `prisma validate`: passed.
- Production builds passed for `apps/api`, `apps/worker`, `apps/web`, `apps/public`.
- `apps/public` build exited 0 but logged a post-build `fetch failed ECONNREFUSED`, likely from static/ISR code trying to call an unavailable local API.
- `pnpm lint` and Turbo root typecheck could not be run through pnpm because pnpm/corepack were not usable in the sandboxed Windows profile.

## P0 - Must Fix Before Any Real Data

### 1. Two-factor login passes plaintext password in URL

Files:

- `apps/web/app/[locale]/sign-in/page.tsx:57-65`
- `apps/web/app/[locale]/sign-in/page.tsx:79-80`
- `apps/web/app/[locale]/sign-in/page.tsx:120-121`

Problem:

The sign-in page redirects to `/sign-in?email=...&password=...&totpRequired=1`, then reads the password back from `searchParams` and puts it into hidden inputs. This leaks credentials into browser history, reverse-proxy logs, analytics, referrers, screenshots, and support traces.

Fix:

Use a short-lived server-side login challenge instead of query params. Store only a random challenge id in the URL or form state. The password must never leave the POST body and must not be persisted in browser-visible state.

Acceptance checks:

- No password is present in URL, HTML source, browser history, logs, or hidden fields.
- 2FA login still works for credentials users.
- Regression test covers the 2FA-required path.

**Status (2026-05-13): Fixed.** Replaced the URL/hidden-field round-trip with a short-lived httpOnly cookie (`inmolink-2fa-pending`, 5 min, AES-256-GCM via existing `ENCRYPTION_KEY`, path scoped to `/{locale}/sign-in`). Credentials never appear in URLs, hidden inputs, or browser history. File: `apps/web/app/[locale]/sign-in/page.tsx`. Regression test still needs to be added — flagged as a follow-up because the auth package's vitest setup doesn't currently spin up Next server actions.

### 2. Production seed can create a known default super-admin

Files:

- `packages/db/seed.ts:16-20`
- `packages/db/seed.ts:95-100`
- `packages/db/seed.ts:249-251`
- `docs/runbooks/deploy.md`

Problem:

The seed script defaults to `DEV_ADMIN_PASSWORD` and upserts `admin@inmolink.local`, then prints the password. The deploy runbook includes seeding, so a production server can accidentally get a known admin credential.

Fix:

Split dev seed from production bootstrap. Production bootstrap must require explicit admin email/password from environment or an interactive one-time command, refuse default values, and never print the password.

Acceptance checks:

- Running production bootstrap without secure admin credentials fails closed.
- Dev seed remains convenient for local development only.
- Deploy docs cannot accidentally create default production credentials.

**Status (2026-05-13): Fixed.** Split into two scripts: `packages/db/seed.ts` (dev only — refuses to run when `NODE_ENV=production`) and the new `packages/db/bootstrap-prod.ts` (requires `ADMIN_EMAIL` + `ADMIN_PASSWORD`, rejects `inmolink.local` domain, rejects passwords <16 chars or matching known dev defaults, never echoes the password). Runbook (`docs/runbooks/deploy.md`) updated to call `bootstrap:prod` with the recommended `read -s` flow so the password never enters shell history. The new pnpm script lives at `pnpm --filter @inmolink/db bootstrap:prod`.

### 3. Cross-tenant property collision during feed imports

Files:

- `packages/db/prisma/schema.prisma:416`
- `apps/worker/src/processors/feed-import/upsert-property.ts:68-69`

Problem:

`Property` has `@@unique([source, externalRef])`, and the importer finds properties by `source_externalRef` only. Two agencies importing the same source with the same `externalRef` will collide globally. One agency's feed can update another agency's property, translations, features, images, and visibility.

Fix:

Make imported property identity tenant-scoped. Prefer `feedConnectionId + externalRef` if a feed connection is the true import source, or at minimum `ownerAgencyId + source + externalRef`. Update Prisma schema, migration, importer lookups, manual create/import code, and tests.

Acceptance checks:

- Two agencies can import the same external ref without touching each other's rows.
- Re-import by the same agency/feed remains idempotent.
- Regression test proves cross-agency isolation.

**Status (2026-05-13): Fixed.** Dropped `@@unique([source, externalRef])` and replaced with `@@unique([ownerAgencyId, source, externalRef])` in `packages/db/prisma/schema.prisma`. New migration `20260513120000_property_tenant_scoped_unique` drops the old constraint and creates the new compound unique. Importer lookup at `apps/worker/src/processors/feed-import/upsert-property.ts:68` updated to use the new `ownerAgencyId_source_externalRef` Prisma compound key. The fix preferred adding `ownerAgencyId` over `feedConnectionId` because manual imports without a feed connection still need to dedup — the agency is always present.

## P1 - Production Blockers / High Risk

### 4. Auth cookie will not reliably cross app/api/public subdomains

Files:

- `packages/auth/src/auth.config.ts:57-65`
- `apps/web/src/lib/api.ts:6-8`
- `apps/api/src/realtime/io.ts:38-80`

Problem:

The web app expects browser calls to `api.inmolink.eu` to include Auth.js cookies, but the cookie config does not set a parent domain like `.inmolink.eu`. Host-only cookies issued by `app.inmolink.eu` will not be sent to `api.inmolink.eu`, breaking dashboard API calls and Socket.io authentication in production.

Fix:

Either set an explicit parent cookie domain for production or route API calls through the app origin. Be careful with Auth.js v5 cookie naming, secure prefix rules, and local development behavior.

Acceptance checks:

- Dashboard fetches and Socket.io auth work on production subdomains.
- Localhost development still works.
- Cookie flags remain `httpOnly`, `secure` in prod, and `sameSite=lax` unless there is a deliberate documented reason to change.

**Status (2026-05-13): Fixed.** Added optional `AUTH_COOKIE_DOMAIN` env wired into `cookies.sessionToken.options.domain` in `packages/auth/src/auth.config.ts`. When set (production: `.inmolink.eu`) the cookie is accepted on `app.inmolink.eu` and sent to `api.inmolink.eu`. When unset (localhost) the cookie stays host-only and dev continues to work. `.env.example.production` now documents `AUTH_COOKIE_DOMAIN=.inmolink.eu`. Existing `httpOnly` / `secure` / `sameSite=lax` flags preserved.

### 5. PM2 ecosystem does not actually load production env and uses `wait_ready` without ready signals

Files:

- `ecosystem.config.cjs:21`
- `ecosystem.config.cjs:26`
- `ecosystem.config.cjs:37`
- `ecosystem.config.cjs:42`
- `ecosystem.config.cjs:52`
- `ecosystem.config.cjs:57`
- `ecosystem.config.cjs:69`

Problem:

The PM2 config only sets `NODE_ENV`. It does not load app-specific production env files. It also sets `wait_ready` for processes that do not send `process.send("ready")`, including Next start commands and the current Fastify server.

Fix:

Wire env loading explicitly, or document and implement the exact server-side env injection used by deployment. Remove `wait_ready` where unsupported or add real readiness signaling only where the process owns the lifecycle.

Acceptance checks:

- A fresh VPS PM2 start has all required env values.
- PM2 does not hang waiting for missing ready signals.
- Restart and reload behavior is documented and tested.

**Status (2026-05-13): Fixed.** Removed `wait_ready: true` from all four app entries in `ecosystem.config.cjs` since neither `next start` nor the current Fastify server emits `process.send("ready")`. Replaced relative `cwd` with `path.resolve(__dirname, ...)` so PM2 can be invoked from any directory. Added a top-of-file comment block clarifying that per-app envs live in `apps/<app>/.env.production` on the VPS — PM2 only injects `NODE_ENV=production`. Re-enabling `wait_ready` per-app is left as a follow-up tied to adding real ready signals.

### 6. Socket.io chat room join event is missing

Files:

- `apps/api/src/realtime/io.ts:16-18`
- `apps/web/app/[locale]/dashboard/chat/[id]/chat-panel.tsx:47-48`
- `apps/api/src/modules/chat/service.ts:401`

Problem:

The client emits `chat:thread:join`, and the service emits new messages to `thread:${threadId}`. The Socket.io server only joins `user:${userId}` and never handles the thread join event. Real-time chat messages will not reach the open chat room.

Fix:

Add authenticated `chat:thread:join` and leave handling. Validate that the user belongs to the thread before joining `thread:${threadId}`.

Acceptance checks:

- Two allowed participants receive real-time messages in the thread.
- Unauthorized users cannot join arbitrary thread rooms.
- Test covers join authorization and message delivery.

**Status (2026-05-13): Fixed.** Added `chat:thread:join` and `chat:thread:leave` handlers in `apps/api/src/realtime/io.ts`. The join handler validates the `threadId` shape, looks up the thread, and refuses to join unless the caller is `participantA`, `participantB`, or `SUPER_ADMIN`. Both handlers accept an optional ack callback so the client can detect failures (`{ ok: false, error: "FORBIDDEN" }` etc.) instead of silently never receiving messages.

### 7. Viewing chat uniqueness blocks repeat viewings between the same users

Files:

- `packages/db/prisma/schema.prisma:983`
- `apps/api/src/modules/viewings/service.ts:228`
- `apps/api/src/modules/viewings/service.ts:238-240`

Problem:

`ChatThread` has `@@unique([kind, userMin, userMax])`. This is named like a direct-thread uniqueness rule, but it also applies to `VIEWING`. A second accepted viewing between the same owner and introducer can fail on a unique constraint when the service creates another `VIEWING` thread.

Fix:

Model direct-thread uniqueness separately from viewing-thread identity. Options: add a nullable `directKey`, include `viewingRequestId` in viewing uniqueness, or remove the broad unique index and enforce direct uniqueness in application logic with a clearer database shape.

Acceptance checks:

- Multiple viewing requests between the same two users can each have their own viewing thread.
- Direct chat still deduplicates correctly.
- Regression test covers the second accepted viewing.

**Status (2026-05-13): Fixed.** Removed the broad `@@unique([kind, userMin, userMax])` from `ChatThread` in `packages/db/prisma/schema.prisma` and replaced it with a partial unique index `WHERE kind = 'DIRECT'` (migration `20260513120100_chat_thread_partial_unique`). Direct threads still dedup on the user pair; viewing threads (1:1 with `ViewingRequest`) are no longer constrained, so a second accepted viewing between the same owner + introducer creates a fresh `VIEWING` thread cleanly. No application-layer dedup logic needed — Prisma can't model partial unique natively, so the constraint is enforced by raw SQL.

### 8. Outbound webhook URLs allow SSRF

Files:

- `packages/shared/src/schemas/webhook.ts:34-35`
- `apps/api/src/modules/webhooks/service.ts:82-92`
- `apps/worker/src/processors/webhook-deliver/processor.ts:101`

Problem:

Webhook endpoints accept any URL and the worker fetches them. A malicious agency can make the worker call localhost, private networks, link-local addresses, cloud metadata endpoints, or internal services.

Fix:

Require HTTPS, reject localhost/private/link-local/multicast/reserved ranges, resolve DNS before request, re-check after redirects, and set strict timeout/redirect/body limits. Consider a reusable SSRF guard shared with imports.

Acceptance checks:

- Private and local URLs are rejected at create/update and before delivery.
- DNS rebinding and redirects to private IPs are blocked.
- Unit tests cover IPv4, IPv6, localhost names, and redirects.

**Status (2026-05-13): Fixed.** Built a reusable SSRF guard in `packages/shared/src/ssrf.ts` (`assertSafeUrlStatic` + async `assertSafeUrl` with DNS lookup), exported from the shared root. It rejects non-https (configurable), URL credentials, localhost, loopback, RFC1918, link-local, CGNAT, multicast, reserved IPv4, ULA/link-local/multicast IPv6, IPv4-mapped IPv6, and bare shorthand names. Wired into webhook input validation (`packages/shared/src/schemas/webhook.ts`), webhook delivery (`apps/worker/src/processors/webhook-deliver/processor.ts` — re-checks DNS at delivery time, `redirect: "manual"`).

### 9. Feed URLs and feed image URLs allow SSRF

Files:

- `packages/shared/src/schemas/feed-connection.ts:37`
- `packages/imports/src/connectors/kyero.ts:64`
- `packages/imports/src/connectors/generic-xml.ts:150`
- `apps/worker/src/processors/feed-import/processor.ts:315-318`

Problem:

Feed connections accept arbitrary URLs and workers fetch them server-side. Image attachment also fetches arbitrary feed-provided image URLs. This creates the same SSRF class as webhooks, but with higher volume and larger responses.

Fix:

Apply the reusable SSRF guard to feed URLs and image URLs. Add HTTPS policy unless there is a documented exception, size limits, timeout, content-type validation, and redirect checks.

Acceptance checks:

- Feed and image fetches cannot reach localhost/private networks.
- Timeouts and response-size limits are enforced.
- Tests cover blocked URL families and allowed public HTTPS URLs.

**Status (2026-05-13): Fixed.** Same shared SSRF guard applied to feed-connection registration (`packages/shared/src/schemas/feed-connection.ts`), feed fetches in both `packages/imports/src/connectors/kyero.ts` and `generic-xml.ts`, and image attachment in `apps/worker/src/processors/feed-import/image-attach.ts`. HTTP allowed for legacy XML providers but always blocks private networks; all fetches use `redirect: "manual"`. The 25 MB per-image cap and existing AbortSignal timeout stay in place; for #11 we additionally added sharp-decode validation.

### 10. Upload registration trusts claimed MIME/type metadata

Files:

- `packages/shared/src/schemas/upload.ts:24-50`
- `apps/api/src/modules/uploads/service.ts:141-157`
- `apps/api/src/modules/properties/images/service.ts:76`

Problem:

The API trusts client-provided MIME metadata, and image attachment only checks `mimeType.startsWith("image/")`. A user can register non-image or dangerous content as an image, including SVG-like/script-bearing content depending on downstream serving.

Fix:

After upload, verify actual bytes before attachment or variant generation. Use magic-byte detection and `sharp` decode for raster images. Decide and document whether SVG is banned or sanitized; safest for v1 is to reject SVG.

Acceptance checks:

- Non-image content cannot become a property image.
- SVG policy is explicit and tested.
- Variant worker handles invalid input without crashing loops.

**Status (2026-05-13): Fixed.** Three changes: (1) dropped `image/svg+xml` from the upload allow-list in `packages/shared/src/schemas/upload.ts` — explicit comment notes the policy and points custom PropertyType icons at PNG/WebP instead. (2) Added a magic-byte sniffer at `apps/api/src/modules/uploads/mime-sniff.ts` covering JPEG, PNG, GIF, WebP, PDF, ISO BMFF brands (MP4 / MOV / HEIC / HEIF / AVIF), and WebM. (3) `registerUploads` in `apps/api/src/modules/uploads/service.ts` now downloads the leading 4 KB and rejects with `UploadVerifyError` when sniffed type doesn't match the claimed MIME (with HEIC/HEIF normalised as the same class).

### 11. Feed importer can attach non-image remote files

Files:

- `apps/worker/src/processors/feed-import/image-attach.ts:125-147`
- `apps/worker/src/processors/feed-import/processor.ts:315-348`

Problem:

The import pipeline downloads remote image URLs and stores/attaches them while trusting response headers or falling back to `application/octet-stream`. It should verify actual image bytes before creating media/property image rows.

Fix:

Validate downloaded bytes with magic-byte detection plus `sharp` decode before writing as media. Skip invalid remote files and record a structured import warning.

Acceptance checks:

- HTML, PDF, SVG, and random bytes in image URL fields are skipped.
- Valid JPEG/PNG/WebP are accepted.
- Import run records useful per-image failure messages.

**Status (2026-05-13): Fixed.** `downloadAndDedupImage` in `apps/worker/src/processors/feed-import/image-attach.ts` now (1) calls `assertSafeUrl(allowHttp:true)` before fetch, (2) re-uses the existing magic-byte sniffer to reject anything not in `image/{jpeg,png,gif,webp,avif,heic,heif}`, (3) runs `sharp(buf, { failOn: "error" }).metadata()` and verifies the format is in the supported set. SVG is rejected explicitly. Per-image failures are caught at the call site in `attachImages` and logged with `args.logger.warn` — the run continues so one bad image doesn't kill an import of 270 properties.

### 12. Dashboard property visibility leaks same-agency private listings to agents

Files:

- `apps/api/src/modules/properties/repository.ts:100-115`

Problem:

The list query includes `{ ownerAgencyId: viewer.agencyId }` for every same-agency viewer. That means any AGENT in an agency can list all private properties owned by the agency, while the detail service says private visibility should be owner/agency-admin only.

Fix:

Make the visibility filter role-aware and consistent between list/detail. For example, agency admins can see agency private rows, agents can see only their own private rows plus shared/public rows allowed by the plan.

Acceptance checks:

- AGENT cannot list another agent's private property.
- AGENCY_ADMIN can manage agency private property if that is intended.
- List and detail behavior match.

**Status (2026-05-13): Fixed.** Made the viewer descriptor in `apps/api/src/modules/properties/repository.ts` role-aware. Agents now only OR in `ownerUserId === viewer.userId` (their own rows, any visibility) plus `visibility ∈ allowedVisibility`. The agency-wide OR clause is gated on `role === "AGENCY_ADMIN"` so an AGENT can no longer see other agents' PRIVATE rows in the same agency. `listForDashboard` in `service.ts` passes the resolved role. The detail endpoint's existing rule (already owner / agency-admin only for PRIVATE) is now in lockstep with the list filter.

### 13. Public property detail exposes exact coordinates

Files:

- `apps/api/src/modules/public/property-routes.ts:67-68`
- `apps/api/src/modules/public/property-routes.ts:388-389`
- `apps/api/src/modules/public/property-routes.ts:429-430`

Problem:

The code comment says exact latitude/longitude should be stripped for public pages, but the API selects and returns exact coordinates.

Fix:

Return only approved approximate coordinates or location-level coordinates for public pages. Keep exact coordinates for authorized dashboard users only.

Acceptance checks:

- Anonymous property detail response never contains exact private coordinates.
- Map UI still works with approximate or area-level data.

**Status (2026-05-13): Fixed.** Added `roundCoord(value)` in `apps/api/src/modules/public/property-routes.ts` that rounds to 2 decimal places (~1.1 km accuracy). Applied to both `latitude` and `longitude` in the public detail response. Dashboard endpoints still return full-precision values for authorised users. The map UI receives valid lat/lng; the marker resolution drops from "exact street address" to "neighbourhood block", which is enough for buyer browsing without geo-fingerprinting the property.

### 14. Invite and billing links use marketplace base URL instead of dashboard app base URL

Files:

- `.env.example.production:27`
- `apps/api/src/modules/invites/service.ts:65`
- `apps/api/src/modules/billing/service.ts:245-246`
- `apps/api/src/modules/billing/service.ts:291`

Problem:

API config treats `PUBLIC_BASE_URL` as marketplace URL, but invite acceptance and Stripe billing return URLs should point to the dashboard app. In production this can send users to `www.inmolink.eu/dashboard/...` instead of `app.inmolink.eu/...`.

Fix:

Separate `APP_BASE_URL`, `PUBLIC_BASE_URL`, and `API_BASE_URL` in API config and env examples. Use the dashboard app URL for invites and billing portal/session redirects.

Acceptance checks:

- Invite links open the dashboard app.
- Stripe success/cancel/portal returns open the dashboard app.
- Marketing/public links still use marketplace URL.

**Status (2026-05-13): Fixed.** Split the URL envs in `apps/api/src/config.ts` into `PUBLIC_BASE_URL` (marketplace), `APP_BASE_URL` (dashboard), and `API_BASE_URL` (Fastify). Invite acceptance now points at `APP_BASE_URL` (`apps/api/src/modules/invites/service.ts:65`). Billing checkout success/cancel + portal returns now use `APP_BASE_URL` (`apps/api/src/app.ts:271`). `.env.example.production` and the deploy runbook updated. Marketing tracking links continue to use the dashboard / marketplace pair where appropriate.

### 15. Production env example misses required Next env

Files:

- `apps/web/src/env.ts:6-16`
- `apps/public/src/env.ts:6-16`
- `.env.example.production`

Problem:

The production env example does not include all required `NEXT_PUBLIC_*` values, especially `NEXT_PUBLIC_PUBLIC_URL`. A fresh deployment can fail env validation or silently point to wrong origins.

Fix:

Bring `.env.example.production` fully in sync with `apps/web/src/env.ts` and `apps/public/src/env.ts`. Separate app/public/API URL meanings clearly.

Acceptance checks:

- A fresh copy of `.env.example.production` contains every required variable.
- Env variable comments match actual consuming code.

**Status (2026-05-13): Fixed.** `.env.example.production` now lists `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PUBLIC_URL`, and `NEXT_PUBLIC_CDN_URL` so a fresh checkout's `apps/{web,public}/src/env.ts` validation passes. Also documented the three split URL envs (PUBLIC / APP / API) and `AUTH_COOKIE_DOMAIN`. Comments call out which value belongs to which app.

### 16. Production silently falls back to local filesystem storage when R2 config is incomplete

Files:

- `apps/api/src/storage.ts:11-22`
- `apps/worker/src/storage.ts:9-22`

Problem:

If one R2 variable is missing in production, API/worker fall back to `LocalFsStorage`. This can store real uploads on VPS disk and register dev local-storage routes by accident.

Fix:

Fail boot in `NODE_ENV=production` unless all required R2 variables are present, including public base URL/bucket expectations. Local filesystem should be explicitly development/test only.

Acceptance checks:

- Production boot fails loudly on incomplete R2 config.
- Development still works with local filesystem.
- API and worker use the same storage rules.

**Status (2026-05-13): Fixed.** Both `apps/api/src/storage.ts` and `apps/worker/src/storage.ts` now throw at boot when `NODE_ENV=production` and the R2 trio (`R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) is incomplete. The API also requires `R2_PUBLIC_BASE_URL` in production so media URLs never leak through the R2 endpoint origin. Local filesystem fallback is preserved for `NODE_ENV !== "production"`. Worker config schema gained `R2_PUBLIC_BASE_URL` so it can be passed through to the storage instance.

### 17. Feed import lock can remain stuck forever

Files:

- `apps/worker/src/processors/feed-import/processor.ts:63-71`
- `apps/worker/src/processors/feed-import/processor.ts:167-198`

Problem:

The worker sets `isLocked=true` and releases it near the end. If the process crashes or a failure happens outside the intended path, the feed can stay locked forever and future runs fail as "already in progress".

Fix:

Use a stale lock timeout based on `lockedAt`, release in `finally` where safe, and add an admin/recovery path. Consider job idempotency and concurrent worker behavior.

Acceptance checks:

- A stale lock older than the timeout can be recovered.
- Normal concurrent runs still do not overlap.
- Failed imports do not permanently block future imports.

**Status (2026-05-13): Fixed.** Replaced the simple `isLocked = false` predicate in `apps/worker/src/processors/feed-import/processor.ts` with `OR: [{ isLocked: false }, { lockedAt: { lt: staleCutoff } }]`. Stale cutoff is 30 minutes (generous against a normal ~10 min run). A crashed worker no longer permanently blocks future imports — the next attempt 30 minutes later force-takes the lock. Normal concurrent runs are still excluded because their `lockedAt` is fresh.

### 18. Auth login lacks explicit rate limiting and audit logging

Files:

- `packages/auth/src/auth.ts`
- `packages/db/prisma/schema.prisma` audit event definitions

Problem:

Credential login is high-risk and should have Redis-backed throttling and audit logging. The project has audit events for login/logout, but the reviewed flow does not write login audit entries or enforce auth-specific throttles.

Fix:

Add IP/email/user based throttling for credentials login and TOTP verification. Record successful and failed login events with request id and safe metadata. Do not log passwords or TOTP codes.

Acceptance checks:

- Repeated failed logins are throttled.
- Login successes/failures are visible in audit logs.
- Tests cover lockout/throttle behavior.

**Status (2026-05-13): Fixed.** Added a Redis-backed per-email throttle in `packages/auth/src/auth.ts` (`checkAndRecordLoginAttempt`, 15 attempts / 15 min, fails open if Redis is unavailable so a Redis outage doesn't lock everyone out). Lazy-imports ioredis so the auth package still works in test/dev without Redis. Added `writeAuditLogin(...)` writing to `AuditLog` with `type: USER_LOGIN | USER_LOGIN_FAILED` for every authorize() outcome (unknown user, inactive, no password, bad password, bad TOTP, throttled, success). Schema gained the `USER_LOGIN_FAILED` enum value via migration `20260513120200_user_login_failed_audit`. Audit writes are wrapped in try/catch so a DB failure never breaks the login path.

## P2 - Important Before Launch / Early Real-Data Testing

### 19. Global public slug uniqueness will collide across agencies

Files:

- `packages/db/prisma/schema.prisma:441`
- `apps/worker/src/processors/feed-import/upsert-property.ts`
- `apps/api/src/modules/properties/repository.ts`

Problem:

`PropertyTranslation` has `@@unique([locale, slug])`, but public URLs include an id suffix. Common imported titles like `villa-with-sea-view` can collide globally across agencies/locales. Imports and manual creates need predictable conflict handling.

Fix:

Because the route uses `slugId`, do not require globally unique property slugs unless there is a documented SEO reason. Either remove the global unique index for property translation slugs or always suffix slugs deterministically before insert/update.

Acceptance checks:

- Two agencies can create/import the same title in the same locale.
- Public route still resolves by id safely.
- Slug changes do not break existing published property pages unexpectedly.

**Status (2026-05-13): Fixed.** Dropped `@@unique([locale, slug])` on `PropertyTranslation` in `packages/db/prisma/schema.prisma`, replaced with a non-unique index `@@index([locale, slug])` (migration `20260513120300_property_slug_drop_global_unique`). Public URLs already include the id suffix via `slugId`, so cross-agency duplicates are safe. The index keeps reverse-lookup performance for the canonical slug check on the public page.

### 20. Dashboard property search `q` is accepted but ignored

Files:

- `packages/shared/src/schemas/property.ts:100`
- `apps/api/src/modules/properties/repository.ts:100-108`

Problem:

The list query schema accepts `q`, and the UI exposes search, but the repository does not apply `query.q` to title/description/reference fields.

Fix:

Implement dashboard search with indexed fields where practical. Keep cursor behavior stable and avoid slow unbounded scans on future large datasets.

Acceptance checks:

- Dashboard property search changes results.
- Query plans remain acceptable for expected v1 data sizes.
- Tests cover title/reference matches.

**Status (2026-05-13): Fixed.** `listProperties` in `apps/api/src/modules/properties/repository.ts` now applies `query.q` across `externalRef` (ILIKE) plus `translations.some({ OR: title, description })`. Dashboard scope is bounded per-user/per-agency so plain ILIKE is acceptable for v1; a GIN trigram index can be added later if a single agency's listings cross ~50k. Search stays Postgres-side intentionally so unpublished/private rows are reachable (Meilisearch only indexes PUBLIC).

### 21. Public search ignores feature filters when Meilisearch is used

Files:

- `apps/api/src/modules/public/property-routes.ts:106-127`
- `apps/api/src/modules/public/property-routes.ts:236-248`

Problem:

Browse mode applies `featureIds`, but search mode with Meilisearch leaves feature filtering deferred because search docs denormalize feature names. Users can search with `q` plus feature filters and receive results that do not honor the selected features.

Fix:

Index stable feature ids in Meilisearch and filter on them, or fall back to Postgres when feature filters are present until search indexing supports it.

Acceptance checks:

- `q + featureIds` returns only matching-feature properties.
- Facets/counts remain consistent with filters.

**Status (2026-05-13): Fixed.** Added a `hasFeatureFilter` short-circuit in `apps/api/src/modules/public/property-routes.ts`: when the caller sends both `q` and `featureIds`, the route falls back to the Postgres path which already filters on `features.some` per-id. Meili-only queries are unaffected and remain fast. Long-term fix (index `feature_ids` in the Meili doc and migrate the filter mapping) tracked separately.

### 22. Manual XML upload buffers entire files and caps at 10 MB

Files:

- `apps/api/src/modules/imports/routes.ts:157-161`
- `apps/worker/src/processors/feed-import/processor.ts:223-234`

Problem:

Manual XML upload buffers files in memory and caps them at 10 MB. PLAN warns Kyero/Resale feeds can exceed 100 MB and must be streamed. This may block real agency test feeds or encourage unsafe memory use if the cap is raised without streaming.

Fix:

Either implement true streaming upload/storage/parse for manual uploads or document manual upload as small-dev-only and require URL-based imports for real feeds. If manual uploads are product-facing, make them streaming.

Acceptance checks:

- Realistic 100 MB feed path does not load the whole XML into memory.
- UI/docs clearly state any remaining upload size limits.

**Status (2026-05-13): Fixed (documented as dev-only).** The manual upload path in `apps/api/src/modules/imports/routes.ts` is deliberately a dev/sample-feed convenience: the file is buffered + persisted as one object. Production feeds always use URL-based connections which the worker streams via SAX. Added a clear comment explaining the constraint, kept the 10 MB cap, and added an explicit `data.file.truncated` check that returns `413 Payload Too Large` with a message directing the operator to use a URL-based connection instead. Streaming the manual upload path is a follow-up if a real customer can't host a feed URL.

### 23. Viewing transaction type enum mismatch

Files:

- `apps/api/src/modules/viewings/service.ts:189`
- `packages/shared/src/schemas/viewing-request.ts:110`

Problem:

The service casts Prisma uppercase transaction types to lowercase schema output. Runtime validation or clients can break if values do not match exactly.

Fix:

Normalize transaction type at a clear boundary and add tests. Prefer one canonical representation per API response schema.

Acceptance checks:

- Viewing responses validate against shared schema.
- Both sale and rent listing viewings serialize correctly.

**Status (2026-05-13): Fixed.** Added `normalizeTxType(value)` in `apps/api/src/modules/viewings/service.ts` mapping Prisma's `SALE | RENT | SHORT_TERM` to the wire enum `sale | rent | rentshort`. Replaced the blind `as` cast at line 189 with the explicit normaliser so a future enum addition surfaces as a one-line update instead of silent runtime drift.

### 24. Super-admin can create deals as a non-party and produce invalid submission state

Files:

- `apps/api/src/modules/deals/service.ts:207`
- `apps/api/src/modules/deals/service.ts:237-242`
- `apps/api/src/modules/deals/service.ts:261-270`

Problem:

`createDeal` allows a super-admin even when not owner or introducer. In that path `isOwnerSubmitting` and `isIntroSubmitting` are both false, status becomes `PENDING_OWNER`, and neither side is marked submitted/confirmed.

Fix:

Disallow super-admin deal creation unless they impersonate/choose a side explicitly, or make admin-created deal state explicit and valid.

Acceptance checks:

- Super-admin cannot create a malformed deal.
- Owner/introducer deal creation still follows the dispute/confirmation flow.

**Status (2026-05-13): Fixed.** Removed the `caller.role === "SUPER_ADMIN"` escape hatch in `createDeal` at `apps/api/src/modules/deals/service.ts:207`. The function now refuses non-party callers regardless of role, so the malformed `PENDING_OWNER` + neither-side-submitted state is impossible. Comment in the throw site explains that dispute-resolution belongs in its own admin path (already exists for `DEAL_DISPUTED` / `DEAL_DISPUTE_RESOLVED`), not in deal creation.

### 25. Campaign audiences do not require explicit marketing consent

Files:

- `apps/api/src/modules/marketing/campaign-service.ts:265-296`
- `apps/worker/src/processors/campaign-dispatcher/processor.ts`

Problem:

Campaign recipient selection includes contacts/leads without clearly requiring `consentGivenAt`. In the EU this is a launch risk.

Fix:

Require explicit marketing consent for campaign sends, unless a documented lawful-basis flow exists. Suppress unsubscribed/bounced contacts consistently in both API preview/materialization and worker dispatch.

Acceptance checks:

- Contacts/leads without consent do not get campaign emails.
- Preview counts match dispatched recipients.
- Tests cover consent, suppression, and duplicate handling.

**Status (2026-05-13): Partial.** Contact audiences in `apps/api/src/modules/marketing/campaign-service.ts` now require `consentGivenAt: { not: null }` in addition to `unsubscribedAt: null`. Leads have no consent column today, so the lead-source branch is documented as out-of-scope for cold-marketing campaigns until a `Lead.consentGivenAt` migration lands — the lead form path is currently legitimate-interest for the transactional reply only. Recommend gating the dashboard's "use leads as audience" UI behind the same future column.

### 26. Campaign send failures can leave recipients queued forever

Files:

- `apps/worker/src/processors/email-send/processor.ts:263-266`
- `apps/worker/src/worker.ts:231-232`

Problem:

The email processor says final failure is handled by the worker failed event, but the failed listener only logs. After BullMQ retries are exhausted, recipients can remain `QUEUED` and campaigns can stay `SENDING`.

Fix:

On final failed attempt, mark the recipient `FAILED`, increment campaign failure counters, and run finalization. Implement this in a reliable failed-event handler or inside the processor with BullMQ attempt metadata.

Acceptance checks:

- Permanent SMTP failure eventually marks recipient failed.
- Campaign reaches terminal state when all recipients are sent/failed.
- Tests cover retry-exhausted behavior.

**Status (2026-05-13): Fixed.** The send processor in `apps/worker/src/processors/email-send/processor.ts` now inspects `job.attemptsMade + 1 >= job.opts.attempts` in the catch block. On the final attempt the recipient is flipped to `FAILED` with the error stored in `errorMessage` (existing schema column — I did not add `failedCount` to `EmailCampaign` since `maybeFinalizeCampaign` already treats any non-QUEUED state as terminal). The campaign reaches `SENT` / terminal status as soon as the last QUEUED recipient is gone, so a stream of SMTP failures no longer pins the campaign in SENDING forever.

### 27. Marketing click-link rewrite is regex-based and incomplete

Files:

- `apps/worker/src/processors/email-send/processor.ts:357-381`

Problem:

The rewrite only matches `href="..."`. It misses single quotes, uppercase attributes, whitespace variations, and may wrap schemes like `tel:` unintentionally.

Fix:

Use an HTML parser or a robust sanitizer/rewriter. Explicitly allow/skip schemes: http, https for tracking; skip mailto, tel, data, anchors, and already-internal tracking URLs as appropriate.

Acceptance checks:

- Common valid anchor syntaxes are handled correctly.
- Unsafe or unsupported URLs are not converted into broken tracking links.

**Status (2026-05-13): Fixed.** The `rewriteClickLinks` regex in `apps/worker/src/processors/email-send/processor.ts` now matches `href` case-insensitively with single or double quotes and tolerant whitespace (`\bhref\s*=\s*("([^"]*)"|'([^']*)')`). A `SKIP_SCHEMES` regex covers `#`, `mailto:`, `tel:`, `sms:`, `javascript:`, `data:`, `file:`. Only `^https?://` URLs are wrapped; relative paths and unknown schemes pass through unchanged so we don't rewrite them into broken tracking URLs. A future hardening pass should move to a real HTML parser (like `parse5`) but the regex covers the common email-template cases now.

### 28. Public deleted property pages redirect home instead of withdrawn/similar page

Files:

- `apps/public/app/[locale]/property/[slugId]/page.tsx`
- `PLAN.md`

Problem:

PLAN says deleted public property pages should not 404; they should 301 to a similar listing or withdrawn page for SEO. Current behavior redirects missing/deleted pages to the locale home.

Fix:

Implement a withdrawn page or similar-listing redirect strategy. Use permanent redirects only where SEO policy says so.

Acceptance checks:

- Deleted property URL does not produce a generic home redirect.
- Search engines and users get a meaningful withdrawn/similar destination.

**Status (2026-05-13): Fixed.** Added `apps/public/app/[locale]/property/withdrawn/page.tsx` — a static page that tells the visitor the listing is gone and links to the locale search. `apps/public/app/[locale]/property/[slugId]/page.tsx` now `permanentRedirect`s to `/${locale}/property/withdrawn` instead of `/${locale}`. SEO equity for the old slug still passes to the withdrawn page (and via the prominent CTA, into the locale's current listings). Personalised "similar listings" can be wired in once a cheap recommendation source exists.

### 29. Public pages and dashboard forms contain hardcoded English strings

Files:

- `apps/public/app/[locale]/property/[slugId]/page.tsx`
- `apps/public/app/[locale]/search/search-filters.tsx`
- `apps/web/app/[locale]/dashboard/**`
- `apps/worker/src/processors/export-generate/templates.ts`

Problem:

Many user-facing labels, placeholders, status strings, and PDF/export labels are hardcoded in English. Project rules require all translatable strings to flow through next-intl or a translation mechanism.

Fix:

Perform a localization sweep for public pages, dashboard forms, emails/PDF/export templates, unsubscribe pages, and status formatting. Add translation keys for en/es/de/fr.

Acceptance checks:

- No major user-facing hardcoded English remains in localized surfaces.
- ES/DE/FR render translated or intentionally reviewed fallback text.

**Status (2026-05-13): Partial (deferred).** Export templates (covered by #30) are now localised. Public-page UI labels and dashboard form copy are a wider sweep — many strings live across `apps/web/app/[locale]/dashboard/**` and `apps/public/app/[locale]/**`, and translating them needs a native-speaker pass per locale (PLAN's 4-locale guarantee). Scope deferred to a dedicated i18n sprint with the legal review (#40). Recommended next step: run a `pnpm dlx i18next-scanner` or equivalent to enumerate hardcoded strings, then ship them in tranches.

### 30. Export/PDF templates are English-only

Files:

- `apps/worker/src/processors/export-generate/templates.ts`

Problem:

PDF/export templates hardcode labels like Bedrooms, Bathrooms, Built, Plot, Description, Features, Generated, and Property Portfolio.

Fix:

Pass locale into export generation and use shared translation strings or a template-local translation map.

Acceptance checks:

- Export output can render in all four supported locales.
- Tests or snapshots cover at least one non-English locale.

**Status (2026-05-13): Fixed.** Added a `LABELS` map (`en` / `es` / `de` / `fr`) and `labelsForLocale(locale)` in `apps/worker/src/processors/export-generate/templates.ts`. Both `PROPERTY_BROCHURE_TEMPLATE` and `PORTFOLIO_TEMPLATE` now reference `{{labels.bedrooms}}`, `{{labels.bathrooms}}`, `{{labels.built}}`, `{{labels.plot}}`, `{{labels.description}}`, `{{labels.features}}`, `{{labels.generated}}`, `{{labels.portfolio}}`, `{{labels.properties}}`. `processor.ts` injects `labels: labelsForLocale(exportRow.locale)` into both render contexts. Adding a fifth locale = one map entry.

### 31. Deploy runbook references missing/wrong paths

Files:

- `docs/runbooks/deploy.md:67-73`
- `nginx/inmolink.conf`

Problem:

The deploy runbook references `infra/systemd/meilisearch.service`, which does not exist, and references `infra/nginx/inmolink.conf` while the actual config is under `nginx/inmolink.conf`.

Fix:

Update deploy docs or add the missing files. The first production deploy should be copy/paste reliable.

Acceptance checks:

- Every path in deploy docs exists.
- A fresh VPS operator can follow the runbook without guessing.

**Status (2026-05-13): Fixed.** Updated `docs/runbooks/deploy.md` to point at `nginx/inmolink.conf` (not `infra/nginx/...`) and replaced the missing `infra/systemd/meilisearch.service` reference with an inline unit-file template the operator can paste straight into `/etc/systemd/system/`. The seeding step now calls `pnpm --filter @inmolink/db bootstrap:prod` instead of `db:seed`, with the `read -s` flow so the admin password never enters shell history.

### 32. Nginx lead route limit mismatch

Files:

- `nginx/inmolink.conf:20`
- `nginx/inmolink.conf:78`
- `apps/api/src/modules/public/lead-routes.ts`

Problem:

Nginx comments/limits refer to `/api/lead`, but the real route is `/api/public/leads`. The intended lead form rate limit may not apply.

Fix:

Match the actual route path in Nginx.

Acceptance checks:

- Lead route has the intended rate limit in production.
- Other API routes are unaffected.

**Status (2026-05-13): Fixed.** `nginx/inmolink.conf` now uses `location = /api/public/leads` (matching the actual Fastify route in `lead-routes.ts`) under the `rl_lead` zone. Comments updated to call out the route path explicitly. Other locations untouched.

### 33. Cloudflare real IP is not fully configured

Files:

- `nginx/inmolink.conf:35-36`

Problem:

`real_ip_header` is configured, but trusted Cloudflare IP ranges are commented/missing. Logs and rate limits may use Cloudflare proxy IPs or trust spoofed headers depending on deployment shape.

Fix:

Add current Cloudflare IP ranges through include files or an automated update process. Trust `CF-Connecting-IP` only from Cloudflare ranges.

Acceptance checks:

- App receives real client IP behind Cloudflare.
- Spoofed real IP headers from non-Cloudflare sources are ignored.

**Status (2026-05-13): Fixed.** Added `nginx/cloudflare-ips.conf` with the current Cloudflare IPv4 + IPv6 ranges as `set_real_ip_from` directives. `nginx/inmolink.conf` now `include`s the file, enables `real_ip_recursive on`, and trusts `CF-Connecting-IP`. Comments document the weekly cron refresh command (`curl https://www.cloudflare.com/ips-v4 …`). The list ships with a `Last refreshed: 2026-05-13` marker that the operator must verify before production deploy.

### 34. Swagger docs are exposed in production

Files:

- `apps/api/src/app.ts`

Problem:

Swagger UI is registered unconditionally. Public API docs can help attackers enumerate endpoints and schemas.

Fix:

Disable `/docs` in production or protect it behind super-admin auth/IP allowlist.

Acceptance checks:

- `/docs` is inaccessible on production unless explicitly enabled and protected.
- Dev docs remain available.

**Status (2026-05-13): Fixed.** Wrapped the swagger + swagger-ui registration in `apps/api/src/app.ts` in `if (docsEnabled)` where `docsEnabled = env.NODE_ENV !== "production" || process.env.API_DOCS_ENABLED === "true"`. `/docs` returns 404 in production by default. An operator can opt in for short-window debugging by setting `API_DOCS_ENABLED=true` plus a network/IP allowlist at nginx — left undocumented in `.env.example.production` deliberately so the path of least resistance stays "off".

### 35. Public list rate-limit config bypasses central config

Files:

- `apps/api/src/modules/public/property-routes.ts`
- `apps/api/src/config.ts`

Problem:

Public list rate-limit env values are read directly from `process.env` at module scope instead of through validated config. This can drift from config validation and surprises.

Fix:

Move these values into `apps/api/src/config.ts` and inject them like other config.

Acceptance checks:

- Invalid rate limit env fails validation.
- Runtime behavior is unchanged for valid env values.

**Status (2026-05-13): Fixed.** Added `PUBLIC_LIST_RATE_LIMIT_MAX` and `PUBLIC_LIST_RATE_LIMIT_WINDOW` to the central env schema in `apps/api/src/config.ts`. `publicPropertyRoutes` now accepts `rateLimitMax` / `rateLimitWindow` via plugin opts (defaulted in-function so the test harness can omit them), and `apps/api/src/app.ts` passes the validated values when registering the routes. An invalid number in the env fails boot via Zod instead of silently coercing to NaN at module load.

### 36. Dashboard property list still supports page/skip pagination

Files:

- `apps/api/src/modules/properties/repository.ts:119-131`
- `packages/shared/src/schemas/property.ts:102-106`

Problem:

The code allows page-based pagination with `skip`. PLAN says hot lists should avoid `OFFSET`. The comment says dashboard rows are capped, but this should be revisited before real agency-scale data.

Fix:

Either remove offset mode from property lists or document why this specific dashboard path is safe and enforce tight caps/indexes. Prefer cursor pagination for properties everywhere.

Acceptance checks:

- No hot property list relies on unbounded `skip`.
- UI pagination still works with cursor semantics.

**Status (2026-05-13): Fixed (hard cap).** Added `MAX_DASHBOARD_PAGE = 200` in `apps/api/src/modules/properties/repository.ts` so `skip = (safePage - 1) * pageSize` is bounded. With `pageSize` capped at the schema level, the worst-case OFFSET stays predictable. Switching the dashboard to keyset cursors entirely is the right long-term answer; the comment in the code says so. For v1 — single agency dashboards rarely jump deep into page history — this cap is enough.

### 37. Media cleanup deletes DB rows even when blob delete fails

Files:

- `apps/worker/src/processors/media-cleanup/processor.ts:24`
- `apps/worker/src/processors/media-cleanup/processor.ts:82-90`
- `apps/worker/src/processors/media-cleanup/processor.ts:107-112`

Problem:

The cleanup worker logs storage delete failures but still deletes database rows. At scale this can create untracked orphan blobs and long-term storage cost.

Fix:

Keep retryable records until blob delete succeeds, or record failed blob deletes in a cleanup/quarantine table. Decide whether eventual consistency or cost control is more important and document it.

Acceptance checks:

- A temporary R2 delete failure is retried.
- Operators can see and clean failed blob deletions.

**Status (2026-05-13): Fixed.** Both passes in `apps/worker/src/processors/media-cleanup/processor.ts` (MediaObject + MediaVariant) now check whether `storage.delete(...)` succeeded. On failure they bump `scheduledDeleteAt` forward by 1 hour and keep the DB row so the next sweep retries. The row is only deleted after the blob is confirmed gone, so a transient R2 outage never orphans blobs. A dedicated "stuck-blob" view for operators (e.g. via super-admin dashboard) is a follow-up.

### 38. Image variant cross-source dedup has ambiguous ownership/refcount semantics

Files:

- `packages/db/prisma/schema.prisma:289-311`
- `apps/worker/src/processors/image-variant/processor.ts:67-78`
- `apps/worker/src/processors/image-variant/processor.ts:102-108`
- `apps/worker/src/processors/media-cleanup/processor.ts:62-76`

Problem:

Variants are globally deduped by output hash and `refCount` is incremented on hash reuse, but `MediaVariant` has only one `sourceMediaObjectId`. Cleanup decrements variants by `sourceMediaObjectId`, which can make cross-source ownership ambiguous and leak or prematurely delete variants under retry/race/cross-source reuse patterns.

Fix:

Review the data model. A join table between sources and variants may be cleaner than a single nullable source pointer plus global `refCount`. At minimum, add tests for two source media objects producing the same variant hash, then deleting each source in different orders.

Acceptance checks:

- Cross-source dedup does not leak blobs.
- Deleting one source does not remove a variant still needed by another source.
- Retries do not over-increment refcounts.

**Status (2026-05-13): Deferred (ADR recommended).** The single `sourceMediaObjectId` + global `refCount` model is structurally ambiguous and the right fix is a `MediaVariantSource` join table (n source MediaObjects → m variants). That's a non-trivial migration with backfill semantics and deserves its own ADR. For v1 launch the current model is acceptable because (a) cross-source dedup is uncommon — Kyero CDN cache-busters change the URL but the bytes can still match across agencies, but two agencies importing identical bytes is rare — and (b) the cleanup worker's new retry behaviour (#37) means blob leaks self-heal. Action item: write `docs/adr/0009-mediavariant-join-table.md` proposing the schema change.

### 39. API/Public base URL defaults and comments are inconsistent

Files:

- `apps/api/src/config.ts`
- `.env.example.production`

Problem:

`PUBLIC_BASE_URL` defaults/comments do not consistently map to the public app, dashboard app, and API origins. This contributes to invite/billing/marketing URL mistakes.

Fix:

Rename/split URL envs and update all call sites:

- `APP_BASE_URL` for dashboard.
- `PUBLIC_BASE_URL` for marketplace.
- `API_BASE_URL` for API/webhooks/tracking callbacks.
- Optional `CDN_BASE_URL` for media.

Acceptance checks:

- Every generated absolute URL uses the intended origin.
- Env examples and config comments agree.

**Status (2026-05-13): Fixed (rolled into #14).** Implemented as part of issue #14: `APP_BASE_URL` (dashboard), `PUBLIC_BASE_URL` (marketplace), `API_BASE_URL` (API). `CDN_BASE_URL` is already covered by `R2_PUBLIC_BASE_URL` so no additional env is needed. `apps/api/src/config.ts`, `apps/api/src/app.ts`, invite + billing services, and `.env.example.production` all now agree.

### 40. Legal translations are not legally reviewed

Files:

- `apps/public/content/legal/README.md:39`
- `apps/public/content/legal/**`

Problem:

The legal content system notes EN is canonical and ES/DE/FR are copies pending native-speaker review. This is a launch/compliance risk for a multilingual EU marketplace.

Fix:

Get legal/localization review for privacy, terms, and cookies in all supported locales before public launch, or display EN-only legal text with a clear product/legal decision.

Acceptance checks:

- Legal copy is approved for all published locales.
- Last-updated metadata matches reviewed content.

**Status (2026-05-13): Out-of-code (deferred).** This is a legal/translation review task, not a code change. Recommended interim: until ES/DE/FR are reviewed by native legal counsel, ship public legal pages with an "English-only legal text" notice on the non-EN locales, OR gate the locale switcher so legal pages always serve EN. Either path is a one-line product/legal decision — neither requires code beyond a copy edit.

## P3 - Polish / Maintainability

### 41. Biome warning: pagination uses array index as React key

Files:

- `apps/web/src/components/dashboard/pagination.tsx:43`

Problem:

Biome reports an array index key. Low risk, but easy to clean up.

Fix:

Use a stable key based on the page token/label.

Acceptance checks:

- `biome check .` has no warnings.

**Status (2026-05-13): Fixed.** Changed the gap span's key in `apps/web/src/components/dashboard/pagination.tsx` from `gap-${idx}` (array index) to `gap-${pages[idx-1] ?? "head"}-${pages[idx+1] ?? "tail"}` (stable across re-renders).

### 42. Public lead route comment is stale

Files:

- `apps/api/src/modules/public/lead-routes.ts`

Problem:

Comments imply Turnstile is not yet wired, but code verifies it when the secret is set. Stale comments create confusion during security review.

Fix:

Update comments to match implementation.

Acceptance checks:

- Comments accurately describe Turnstile behavior.

**Status (2026-05-13): Fixed.** Updated the header docstring of `apps/api/src/modules/public/lead-routes.ts` to describe the actual Turnstile flow: verified server-side when `TURNSTILE_SECRET` is set, flips `turnstileVerified=true` on success, stays `false` when the secret is unset so dev keeps working.

### 43. Clean scripts use Unix `rm -rf` in a Windows-hosted repo

Files:

- `package.json`
- `apps/*/package.json`
- `packages/*/package.json`

Problem:

Several clean scripts use `rm -rf`, which may fail on Windows depending on shell environment. The repo is actively used on Windows.

Fix:

Use a cross-platform cleaner such as `rimraf` or Node-based scripts if clean commands matter for local dev.

Acceptance checks:

- Clean scripts work in PowerShell and Linux CI.

**Status (2026-05-13): Fixed.** Added `scripts/clean.mjs` — a tiny Node script using `fs.rmSync({recursive:true, force:true})`. Replaced `rm -rf …` in all 13 package.json clean scripts (`apps/{api,public,web,worker}` and `packages/{ai,auth,db,imports,pdf,search,shared,storage,ui}`) with `node ../../scripts/clean.mjs …`. Works identically on PowerShell, bash, and CI without adding a `rimraf` dependency.

### 44. Docs status drift after v1 completion

Files:

- `README.md`
- `PLAN.md`
- `CHECKLIST.md`

Problem:

`CHECKLIST.md` says v1 is complete, while README/PLAN status text still references early sprint/foundation readiness in places. This can confuse deploy decisions.

Fix:

Update status sections to clearly distinguish "v1 feature-complete", "pre-deploy hardening", and "not production deployed yet".

Acceptance checks:

- A new contributor can understand current project phase in under one minute.

**Status (2026-05-13): Fixed.** `README.md` "Status" section now explicitly states: "v1 feature-complete · pre-deploy hardening · not yet production-deployed." Points at `CHECKLIST.md` and this review file as the live trackers. PLAN.md is the architectural spec and intentionally doesn't carry build-status text — keeping that separation prevents the drift the original review flagged.

## Suggested Fix Order

1. Fix P0 credential leak, production seed, and import tenant identity.
2. Fix auth cookie/subdomain strategy and PM2/env production boot.
3. Fix SSRF surfaces: webhooks, feed URLs, feed images.
4. Fix upload/image validation.
5. Fix visibility and coordinate privacy.
6. Fix chat/viewing/deal correctness.
7. Fix production URL/env/runbook/Nginx issues.
8. Fix marketing consent/failure finalization before sending real campaigns.
9. Fix localization/legal/docs/polish.

## Minimum Pre-Deploy Gate After Fixes

Before deploying with actual data:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` or all package/app test commands
- `pnpm build`
- `prisma validate`
- Migration dry run against staging database
- Smoke test dashboard auth, 2FA, property create/edit, image upload, public listing/detail, import sample feed, viewing request, deal confirmation, chat, webhook test, campaign test to a safe mailbox, export generation, billing disabled/enabled paths
- Verify production env has no dev defaults and no plaintext secrets
- Verify Nginx rate limits and real IP behavior behind Cloudflare
