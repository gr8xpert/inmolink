# Inmolink Pre-Deploy Issues For Claude

Date: 2026-05-12  
Purpose: Claude-ready bug and hardening tickets before VPS deploy and real-data testing.

## Fix order

Fix all P0 and P1 items before using real customer data. P2 items can happen during staging hardening unless they affect the first test scenario. P3 items are cleanup or polish.

## P0-01: 2FA login leaks plaintext password through URL

Evidence:

- `apps/web/app/[locale]/sign-in/page.tsx:57-65` builds `URLSearchParams` and sets `emailRT` and `pwRT`.
- `apps/web/app/[locale]/sign-in/page.tsx:79-80` reads `emailRT` and `pwRT` from search params.
- `apps/web/app/[locale]/sign-in/page.tsx:120-121` renders them into hidden form inputs.

Risk:

The password enters browser history, logs, referrers, screenshots, proxy logs, analytics, and support traces. This is a real credential disclosure bug.

Fix request:

Replace the query-string password round trip with a server-side pending-login challenge. Acceptable approaches:

- short-lived encrypted HttpOnly cookie containing a pending login token, not the password;
- server-side pending login table keyed by a random nonce;
- ask for password again on the TOTP step.

Acceptance checks:

- No password or equivalent secret appears in URL, query params, page HTML, logs, or hidden fields.
- TOTP required, invalid TOTP, and successful TOTP flows are tested.
- Add a regression test or Playwright check that the redirected URL never contains the submitted password.

## P0-02: Production seed can create a default super-admin account

Evidence:

- `packages/db/seed.ts:16-20` defines a dev default password.
- `packages/db/seed.ts:95-100` upserts `admin@inmolink.local`.
- `packages/db/seed.ts:249-251` prints the admin email and password.
- `docs/runbooks/deploy.md` includes production seed usage.

Risk:

If the deploy runbook is followed unchanged, production can get a known default super-admin pattern. Even if the password is overridden, printing it to logs is unsafe.

Fix request:

Split dev seed from production bootstrap. In production, require an explicit one-time admin creation command that refuses defaults, refuses `.local` admin email, does not print passwords, and ideally forces password reset or email verification.

Acceptance checks:

- `NODE_ENV=production` cannot run the dev seed with default credentials.
- Deploy runbook no longer instructs running the dev seed in production.
- No production command prints a plaintext password.

## P1-03: Auth cookie will not cross `app.` and `api.` subdomains

Evidence:

- `packages/auth/src/auth.config.ts:57-65` pins the Auth.js session cookie but does not set `domain`.
- `apps/web/src/lib/api.ts:6-8` assumes same-site shared cookies/subdomain behavior.
- `apps/api/src/realtime/io.ts:38-80` authenticates Socket.io from the Auth.js cookie.
- `apps/web/app/[locale]/dashboard/chat/[id]/chat-panel.tsx` uses direct API/socket traffic with credentials.

Risk:

In production, a host-only cookie set on `app.inmolink.eu` will not be sent to `api.inmolink.eu`. Server-side Next requests that forward cookies may work, while client fetches and Socket.io fail.

Fix request:

Choose and implement one strategy:

- set a production cookie domain such as `.inmolink.eu` via validated env, with Auth.js v5 docs checked;
- or route browser API/socket traffic through the app origin proxy so the cookie remains host-only.

Acceptance checks:

- Login on dashboard origin authenticates direct dashboard API calls and Socket.io in staging.
- Cookie behavior is tested on real subdomains, not only localhost.
- CORS and SameSite settings are documented.

## P1-04: PM2 and env wiring are not production deterministic

Evidence:

- `ecosystem.config.cjs:21`, `37`, `52`, and `69` set only `NODE_ENV`.
- `ecosystem.config.cjs:26`, `42`, and `57` set `wait_ready: true`.
- `apps/api/src/server.ts` does not send `process.send("ready")`.
- Next `next start` does not send PM2 ready by default.
- `docs/runbooks/deploy.md` says to reference `.env.production` from PM2, but the ecosystem file does not.

Risk:

Processes may fail env validation or PM2 may treat healthy processes as startup failures because readiness is never signaled.

Fix request:

Make production env loading explicit and remove or correctly implement PM2 readiness. Prefer one documented env source for all four apps.

Acceptance checks:

- Fresh VPS deploy can start all PM2 apps from documented commands.
- `pm2 status` shows online without readiness timeouts.
- API and worker env validation passes from the deployed env source.

## P1-05: Chat clients emit room join, but API never handles it

Evidence:

- `apps/api/src/realtime/io.ts:16-18` documents `chat:thread:join`.
- `apps/web/app/[locale]/dashboard/chat/[id]/chat-panel.tsx:47-48` emits `chat:thread:join`.
- `apps/api/src/modules/chat/service.ts:401` emits new messages to `thread:${threadId}`.
- `apps/api/src/realtime/io.ts` only auto-joins `user:${id}` and has no thread join handler.

Risk:

Real-time chat messages will not reach thread subscribers. Users will need refresh/polling behavior even though the UI appears socket-enabled.

Fix request:

Add a socket handler for `chat:thread:join` and `chat:thread:leave`. Validate the authenticated user is a participant before `socket.join("thread:<id>")`.

Acceptance checks:

- Two users in the same chat see messages live without refresh.
- Non-participants cannot join a thread room.
- Add API/socket tests where practical.

## P1-06: Outbound webhook delivery allows SSRF targets

Evidence:

- `packages/shared/src/schemas/webhook.ts:34-35` accepts any URL.
- `apps/api/src/modules/webhooks/service.ts:82-92` stores the endpoint.
- `apps/worker/src/processors/webhook-deliver/processor.ts:101` fetches the stored URL.

Risk:

Agency users can target localhost, private networks, metadata IPs, Redis/admin ports, or services behind the VPS firewall.

Fix request:

Validate webhook URLs at create/update and at delivery time:

- require `https`;
- block loopback, private, link-local, multicast, and metadata ranges;
- resolve DNS and validate resolved IPs;
- re-check redirect targets or disable redirects;
- consider an egress firewall rule as defense-in-depth.

Acceptance checks:

- URLs like `http://127.0.0.1`, `http://localhost`, `http://10.0.0.1`, `http://169.254.169.254`, and private DNS targets are rejected.
- Valid public HTTPS endpoints still work.

## P1-07: Browser upload registration trusts claimed MIME type

Evidence:

- `packages/shared/src/schemas/upload.ts:24-50` validates declared MIME values.
- `apps/api/src/modules/uploads/service.ts:141-157` stores and queues work from `u.mimeType`.
- `apps/api/src/modules/properties/images/service.ts:76` only checks `mimeType.startsWith("image/")`.

Risk:

A user can upload non-image bytes while declaring an image MIME. That object can later be attached and served as a property image or icon.

Fix request:

On register, inspect stored bytes with magic-byte detection and, for images, validate with `sharp` where possible. Reject mismatches. Treat SVG separately: either sanitize strictly or disallow SVG for property images.

Acceptance checks:

- A fake JPEG containing HTML/script is rejected.
- Real JPEG/PNG/WebP pass.
- Property image attach cannot attach an object whose verified content is not an image.

## P1-08: Feed import image attach can store and attach non-images

Evidence:

- `apps/worker/src/processors/feed-import/image-attach.ts:125-147` trusts `image/*` response headers and falls back to `application/octet-stream`.
- `apps/worker/src/processors/feed-import/processor.ts:315-348` attaches the returned media object to `PropertyImage` without checking image MIME.

Risk:

An XML feed can cause arbitrary fetched content to be stored and attached as a property image.

Fix request:

Require verified image MIME after sniffing and preferably verify dimensions with `sharp`. Do not attach unknown or non-image content. Add timeout and max-content-length handling for remote image downloads.

Acceptance checks:

- Feed image URLs returning text/html or octet-stream are skipped and logged.
- Valid images still dedup and attach.
- Import run does not fail the whole property for one bad image unless policy says so.

## P1-09: Dashboard property list leaks same-agency private properties to ordinary agents

Evidence:

- `apps/api/src/modules/properties/repository.ts:112-115` includes `{ ownerAgencyId: viewer.agencyId }` for every viewer.
- `apps/api/src/modules/properties/service.ts:93-95` says private detail is only owner or agency admin.

Risk:

An ordinary `AGENT` can list colleagues' private property metadata even though detail access is blocked. This violates the stated private visibility model.

Fix request:

Make list visibility role-aware:

- `AGENT`: `SHARED` plus own rows;
- `AGENCY_ADMIN`: own-agency rows where intended;
- `SUPER_ADMIN`: unrestricted as today.

Acceptance checks:

- Agent A cannot see Agent B's `PRIVATE` listing in list results.
- Agency admin can see agency listings if that is the intended policy.
- Detail and list behavior match.

## P1-10: Public property detail exposes exact latitude/longitude

Evidence:

- `apps/api/src/modules/public/property-routes.ts:67-68` says exact lat/long are stripped.
- `apps/api/src/modules/public/property-routes.ts:388-389` selects `latitude` and `longitude`.
- `apps/api/src/modules/public/property-routes.ts:429-430` returns them.

Risk:

Public pages can expose exact property locations when the intended public contract is city-level or approximate location only.

Fix request:

Return null, a rounded coordinate, or a location centroid according to product policy. If exact coordinates are ever public, make it an explicit setting and update `PLAN.md`.

Acceptance checks:

- Public detail response no longer exposes exact stored coordinates by default.
- Tests cover the response contract.

## P1-11: Invite and billing URLs use public marketplace base URL

Evidence:

- `.env.example.production:27` sets `PUBLIC_BASE_URL=https://inmolink.eu`.
- `apps/api/src/modules/invites/service.ts:65` builds invite accept URLs from `env.PUBLIC_BASE_URL`.
- `apps/api/src/modules/billing/service.ts:245-246` and `291` build dashboard Stripe URLs from `ctx.publicBaseUrl`.

Risk:

Invite links and Stripe return/portal URLs may point to the anonymous marketplace origin instead of the dashboard origin.

Fix request:

Add `WEB_BASE_URL` or `APP_BASE_URL` to API config for dashboard routes. Keep `PUBLIC_BASE_URL` for marketplace/SEO only.

Acceptance checks:

- Invite accept links point to the dashboard app route.
- Stripe success/cancel/portal return URLs point to the dashboard origin.
- Env examples and deploy runbook include both public and app base URLs.

## P1-12: Production env example misses required Next public URLs

Evidence:

- `apps/web/src/env.ts:6-16` requires `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PUBLIC_URL`.
- `apps/public/src/env.ts:6-16` requires `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PUBLIC_URL`.
- `.env.example.production:27-40` has `PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_URL`, and `R2_PUBLIC_BASE_URL`, but no `NEXT_PUBLIC_PUBLIC_URL`.

Risk:

Fresh production builds can fail env validation unless operators know hidden extra variables.

Fix request:

Bring `.env.example.production`, app env examples, and deploy runbook into exact sync with the Zod env schemas.

Acceptance checks:

- A clean production build from only documented env vars succeeds.
- Missing required env vars fail with clear messages.

## P1-13: Deploy runbook references missing paths

Evidence:

- `docs/runbooks/deploy.md:67-68` references `infra/systemd/meilisearch.service`.
- `docs/runbooks/deploy.md:73` references `infra/nginx/inmolink.conf`.
- Actual Nginx config is under `nginx/inmolink.conf`; no `infra/systemd` directory was found.

Risk:

First VPS deploy will fail or require improvisation.

Fix request:

Either add the missing infra files or correct the runbook to match actual paths. Include exact commands that work from repo root.

Acceptance checks:

- A clean operator can copy/paste the runbook on a new VPS without path fixes.

## P1-14: Auth login rate limiting and audit logging appear incomplete

Evidence:

- `USER_LOGIN` and `USER_LOGOUT` audit event types exist, but sign-in/sign-out writes were not found in the reviewed flow.
- `apps/web/app/[locale]/sign-in/page.tsx` calls Auth.js server action directly.
- No per-IP/per-email login throttle was found in the credentials authorization path during this review.

Risk:

Credential stuffing, brute force, and incident investigation are weaker than the plan requires.

Fix request:

Add Redis-backed login throttling and audit events for login success/failure/logout. Redact sensitive fields.

Acceptance checks:

- Repeated failed login attempts are throttled by IP and account/email.
- Successful login, failed login, and logout are audit logged.
- Tests cover throttle behavior.

## P2-15: Viewing request response enum mismatch

Evidence:

- `apps/api/src/modules/viewings/service.ts:189` returns Prisma `transactionType` with a TypeScript cast to lowercase values.
- `packages/shared/src/schemas/viewing-request.ts:110` expects lowercase `sale`, `rent`, `rentlong`, `rentshort`.

Risk:

Runtime responses may contain uppercase Prisma enum values like `SALE` or `RENT`, breaking response validation or clients.

Fix request:

Either map Prisma values to the schema's lowercase contract or update the shared schema to the canonical uppercase enum used elsewhere.

Acceptance checks:

- Viewing request API response validates at runtime.
- Tests cover at least one SALE and one RENT property.

## P2-16: Marketing campaigns do not appear to require explicit consent

Evidence:

- `apps/api/src/modules/marketing/campaign-service.ts:265-275` selects contacts without requiring `consentGivenAt`.
- `apps/api/src/modules/marketing/campaign-service.ts:282-296` selects leads with email addresses for campaigns.

Risk:

For EU marketing, sending campaigns to contacts/leads without consent or a modeled lawful basis is risky.

Fix request:

Require explicit marketing consent for campaign audiences, or separate transactional messages from marketing campaigns with a clear lawful-basis model.

Acceptance checks:

- Contacts without consent are excluded from marketing sends.
- Leads are not used for campaigns unless consent/lawful basis is recorded.
- UI/API make the rule visible to admins.

## P2-17: Nginx rate limit route for leads does not match API route

Evidence:

- `nginx/inmolink.conf:20` documents `/api/lead`.
- `nginx/inmolink.conf:78` limits `location = /api/lead`.
- The public lead endpoint is under `/api/public/leads`.

Risk:

The lead-specific Nginx limit never applies. Fastify limits may still help, but the edge config is wrong.

Fix request:

Change the Nginx location to match the real lead route and verify all public write endpoints have edge and app-level limits.

Acceptance checks:

- `/api/public/leads` receives the intended Nginx rate limit.

## P2-18: Cloudflare real IP trust is incomplete in Nginx

Evidence:

- `nginx/inmolink.conf:35` sets `real_ip_header CF-Connecting-IP`.
- `nginx/inmolink.conf:36` leaves `set_real_ip_from` commented/snipped.

Risk:

Rate limiting and logs may use Cloudflare edge IPs instead of visitor IPs, or trust headers without the correct source allowlist depending on final config.

Fix request:

Include Cloudflare IP ranges through a managed include file or cron-synced config. Reload Nginx safely when ranges change.

Acceptance checks:

- Logs and app `request.ip` show visitor IP behind Cloudflare.
- Requests not from Cloudflare cannot spoof `CF-Connecting-IP`.

## P2-19: Deleted public property pages redirect home, not similar/withdrawn page

Evidence:

- `apps/public/app/[locale]/property/[slugId]/page.tsx` redirects missing/deleted responses to locale home.
- `PLAN.md` says deleted public property pages should 301 to a similar listing or a withdrawn page.

Risk:

This avoids 404s but is weaker for SEO and user trust than the planned withdrawn/similar behavior.

Fix request:

Implement withdrawn page or similar-listing redirect logic for previously public properties.

Acceptance checks:

- Deleted or withdrawn public listing URLs return the planned 301 behavior.
- Fresh invalid IDs still behave appropriately.

## P2-20: Feed fetches need stronger timeout and size controls

Evidence:

- `packages/imports/src/connectors/kyero.ts` supports a signal.
- The import processor path did not show a timeout signal being passed during this review.
- Image downloads also need explicit timeout handling beyond size counting.

Risk:

Slow or hostile feeds can tie up worker jobs for too long.

Fix request:

Add `AbortController` timeouts for feed XML fetches and image fetches. Enforce `Content-Length` where available and streaming byte limits while reading.

Acceptance checks:

- Hung feed/image URL aborts predictably.
- Oversized response fails with a clear import error and does not exhaust memory.

## P2-21: Public pages still contain hardcoded English strings

Evidence:

- Public property pages include labels such as `Type`, `Bedrooms`, `About this property`, and `Gallery` directly in JSX.
- Project rules require all user-facing strings to flow through `next-intl`.

Risk:

Locales `es`, `de`, and `fr` will show mixed English UI.

Fix request:

Move public UI labels into locale message files and use `next-intl` consistently.

Acceptance checks:

- Public property/search/agency/agent pages render localized chrome in all four locales.
- No obvious hardcoded English labels remain in public UI.

## P2-22: Swagger docs appear exposed in production

Evidence:

- `apps/api/src/app.ts` registers Swagger UI globally during app setup.

Risk:

Public API docs can be useful, but exposing internal dashboard/admin endpoints in production increases reconnaissance surface.

Fix request:

Gate docs in production by env, basic auth, or IP allowlist.

Acceptance checks:

- Production docs exposure is intentional and documented.
- If disabled, `/docs` is not available publicly.

## P2-23: Project status docs drift

Evidence:

- `README.md:9` says v1 is in progress at Sprint 0.
- `PLAN.md:569-571` says ready for Sprint 0.
- `CHECKLIST.md:943` says v1 build complete.

Risk:

Deploy operators and future agents will follow contradictory status signals.

Fix request:

Update `README.md` and the status section of `PLAN.md` to reflect current v1 completion and pre-deploy hardening status. Keep `PLAN.md` architectural content intact.

Acceptance checks:

- README, PLAN status, CHECKLIST, and memory no longer disagree about project phase.

## P3-24: Biome warning from array index key in pagination

Evidence:

- `apps/web/src/components/dashboard/pagination.tsx:43` uses array index as a React key.
- `biome check .` passed with this single warning.

Risk:

Low. Pagination UI can behave oddly if items reorder.

Fix request:

Use a stable key derived from page number/ellipsis identity.

Acceptance checks:

- Biome runs with zero warnings.

## P3-25: Public list rate-limit env parsing bypasses config validation

Evidence:

- `apps/api/src/modules/public/property-routes.ts` reads `PUBLIC_LIST_RATE_LIMIT_MAX` directly with `Number(...)`.
- Changelog notes this was kept out of `config.ts` for bench-time override.

Risk:

Bad env can produce `NaN` and break rate-limit behavior at runtime.

Fix request:

Move the setting into config validation or clamp/fallback invalid values locally.

Acceptance checks:

- Invalid env falls back safely or fails boot clearly.

## P3-26: Dashboard list still supports page/skip pagination

Evidence:

- `apps/api/src/modules/properties/repository.ts:119-130` uses `skip` in page mode.
- PLAN warns not to use `OFFSET` on hot lists.

Risk:

Probably acceptable for small dashboard scopes, but it can degrade on large agencies.

Fix request:

Prefer cursor pagination for hot dashboard lists, or document why page mode is intentionally bounded and safe.

Acceptance checks:

- Large agency property list performs acceptably or uses cursor pagination.

