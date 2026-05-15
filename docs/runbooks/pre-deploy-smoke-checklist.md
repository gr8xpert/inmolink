# Pre-Deploy Smoke Checklist

Date created: 2026-05-13
Owner: solo (webmaster@realtysoft.eu)
Trigger: run before first VPS deploy and after any large fix pass

## Why this exists

Typecheck, lint, unit tests, and `next build` are all green, but the recent
hardening pass (Codex review fixes — see `docs/reviews/claude-master-fix-list-2026-05-12.md`
and `docs/reviews/claude-fix-pass-review-2026-05-13.md`) touched code paths
that have **no automated coverage**. The items below are the manual checks
needed to catch a runtime regression before customers see one.

Tick boxes as you go. If a check fails, log it in `TROUBLESHOOTING.md` and
either fix or roll back before continuing.

---

## 1. Auth + 2FA login flow

The sign-in page was fully rewritten to remove credentials from URL and use
an httpOnly AES-256-GCM cookie between the password and TOTP submits.

- [ ] Fresh browser session: password-only login (user without TOTP) succeeds and lands on `/dashboard`.
- [ ] Wrong password shows the generic invalid-credentials error (not a 500, no email/password in the URL).
- [ ] User with TOTP enrolled: password submit shows the TOTP form, URL stays clean (no `?email=...&password=...`).
- [ ] Correct TOTP completes login; the `inmolink-2fa-pending` cookie is gone afterwards.
- [ ] Wrong TOTP shows the "code is incorrect or expired" error and lets you retry without re-entering password.
- [ ] Leave the TOTP form idle > 5 min, submit a code → flow restarts at password (cookie expired path).
- [ ] DevTools → Application → Cookies: `inmolink-2fa-pending` is `HttpOnly`, `SameSite=Lax`, `Secure` in prod, path is `/{locale}/sign-in`.

## 2. Login throttle + audit log

`packages/auth/src/auth.ts` now calls `checkAndRecordLoginAttempt(email)`
(Redis-backed, 15 attempts / 15 min, fails open) and writes a
`USER_LOGIN` / `USER_LOGIN_FAILED` row per attempt.

- [ ] 15 bad attempts in a row on the same email → 16th attempt is throttled with the throttle error.
- [ ] After 15 min wait the same email can attempt again.
- [ ] Stop Redis, attempt login → login still works (fail-open path), no 500.
- [ ] Admin → Audit log shows `USER_LOGIN_FAILED` rows with email + reason, `USER_LOGIN` rows for successes.
- [ ] Audit-log list endpoint serialises the new enum value (response Zod check doesn't reject).

## 3. Direct chat thread creation

Replaced `prisma.chatThread.upsert({ where: { uniqueDirectThread } })` with
`findFirst → create → catch P2002 → re-read` because Prisma can't model the
new partial unique index as an upsert key.

- [ ] Two different agents open a direct chat from each other's profile → exactly one thread exists for the pair (check DB or `/dashboard/chat`).
- [ ] Same pair re-opens later → no duplicate thread, message history preserved.
- [ ] Optional stress: two browser tabs hit "start chat" at the same moment → one wins, the other re-reads (no 500, single row in DB).

## 4. Upload + MIME sniff via `readHead`

`Storage.readHead(key, 4096)` replaces `download(key)` for MIME sniffing —
mocked in unit tests but never run against real R2.

- [ ] Upload a JPEG via the dashboard (`/dashboard/properties/<id>` media tab). Image appears, no error.
- [ ] Upload a PNG, a WebP, a PDF (where allowed) — each works.
- [ ] Rename a `.exe` to `.jpg` and try to upload → server rejects with "MIME mismatch" (the magic-byte check catches it).
- [ ] Watch API memory during a 50-MB JPEG upload → no spike beyond a few MB (proves the Range request worked; full download would spike).
- [ ] R2 dashboard or `s3cmd ls`: confirm the object actually landed at the expected `media/<aa>/<bb>/<hash>` key.

## 5. Prisma migrations against a real database

Four new migrations from this pass. They apply cleanly in isolation but a
populated DB may surprise them:

- `20260513120000_property_tenant_scoped_unique`
- `20260513120100_chat_thread_partial_unique`
- `20260513120200_user_login_failed_audit`
- `20260513120300_property_slug_drop_global_unique`

- [ ] Take a dump of the current dev DB. Run `prisma migrate deploy` against a copy → all four migrations apply with exit 0.
- [ ] If `Property` had any cross-agency `(source, externalRef)` duplicates pre-migration, deal with them before prod (the new compound key allows them, but you may want to inspect).
- [ ] Confirm `ChatThread` partial-unique exists: `\d chat_thread` in psql should show `WHERE (kind = 'DIRECT')` on the unique index.
- [ ] `AuditEventType` enum lists `USER_LOGIN_FAILED`.

## 6. Production bootstrap script

`packages/db/bootstrap-prod.ts` is new and was never executed.

- [ ] Empty staging DB: `pnpm --filter @inmolink/db bootstrap:prod` with `ADMIN_EMAIL` + `ADMIN_PASSWORD` set → super-admin user is created.
- [ ] Same command with `ADMIN_EMAIL=admin@inmolink.local` → refuses to run (default-domain guard).
- [ ] Same command with `ADMIN_PASSWORD=Inmolink-Dev-2026!` → refuses to run (dev-default-password guard).
- [ ] Run with `NODE_ENV=production` and missing env vars → exits non-zero with a helpful message, no partial writes.
- [ ] Bootstrap log never prints the password.

## 7. Nginx config + Cloudflare IPs

`nginx/inmolink.conf` now `include`s `/etc/nginx/conf.d/cloudflare-ips.conf`,
and the runbook copies both. `nginx/meilisearch.service` is a new tracked unit.

- [ ] On the target VPS, follow `docs/runbooks/deploy.md` from the nginx section. `nginx -t` returns OK.
- [ ] `cat /etc/nginx/conf.d/cloudflare-ips.conf` shows the expected `set_real_ip_from` lines.
- [ ] After reload, `curl -H "CF-Connecting-IP: 1.2.3.4" https://app.inmolink.eu/api/public/ping` (or similar) → server logs show `1.2.3.4` as the client IP, not the Cloudflare edge IP.
- [ ] `systemctl status meilisearch.service` → active (running). Master key is set via `systemctl edit` (not in the unit file).

## 8. SSRF guard runtime behaviour

Edge-safe regex split was driven by `apps/web` build, but the runtime path
matters too.

- [ ] Add a feed connection with `http://localhost/foo.xml` → API rejects with `SSRF blocked: host localhost is private/reserved`.
- [ ] Add a feed with `http://169.254.169.254/latest/meta-data/` → blocked.
- [ ] Add a webhook endpoint with `https://example.com/hook` → accepted.
- [ ] Add a webhook endpoint with a hostname that resolves to `127.0.0.1` (e.g., via `/etc/hosts` trick on the API box) → blocked at `assertSafeUrl` time, not just statically.
- [ ] Image-attach during a feed run pulls a remote image successfully (`assertSafeUrl` doesn't false-positive on real CDNs).

## 9. Public marketplace pages

Coords are now rounded to 2 decimals; deleted properties 301 to the
withdrawn page; coarse pagination caps in place.

- [ ] `/buy/<slug>` for a live listing renders, map shows the 2-decimal location (~1.1 km off true).
- [ ] `/property/<slug>` for a property that was just deleted → 301 → `/property/withdrawn` (DevTools Network tab shows the 301, not a 404).
- [ ] Hammer `?page=500` on a list endpoint → capped to MAX_DASHBOARD_PAGE (200), not a 500.
- [ ] ISR pages re-generate after a property edit (visit, edit, revisit — content updates within revalidation window).

## 10. Marketing campaigns

`source === "leads"` now throws `ForbiddenError`; UI still offers it.

- [ ] Create a campaign with audience source = "contacts" + `consentGivenAt` populated → sends.
- [ ] Create a campaign with audience source = "contacts" + contacts that lack `consentGivenAt` → audience is empty / skips.
- [ ] Create a campaign with audience source = "leads" → API returns 403 with the documented `ForbiddenError`. UX is broken (the form lets you submit); track UI hide in the deferred list.

## 11. Real-time chat over Socket.io

`apps/api/src/realtime/io.ts` now handles `chat:thread:join` /
`chat:thread:leave` with participant auth.

- [ ] Two browser tabs, two different users in the same direct thread. User A sends a message → User B sees it in real-time (no refresh).
- [ ] User C (not a participant) tries to join the thread via DevTools `socket.emit("chat:thread:join", { threadId })` → server rejects, no events leak.
- [ ] Reconnect after disconnect → user re-joins their open thread automatically.

## 12. Final functional sweep

One page per top-level dashboard module, just to confirm nothing 500s after
all the schema / dependency changes.

- [ ] `/dashboard` — landing
- [ ] `/dashboard/properties` — list + open one
- [ ] `/dashboard/imports` — list connections
- [ ] `/dashboard/viewings` — list
- [ ] `/dashboard/deals` — list
- [ ] `/dashboard/chat` — open a thread, send a message
- [ ] `/dashboard/billing` — current plan loads
- [ ] `/dashboard/marketing` — campaign list loads
- [ ] `/dashboard/tickets` — list loads
- [ ] `/dashboard/admin/audit-log` — list loads, `USER_LOGIN_FAILED` filter is present
- [ ] `/dashboard/settings/two-factor` — enroll + verify works
- [ ] `/dashboard/admin/webhooks` (if exposed) — list + create

---

## When to retire this checklist

Move the items here into automated tests as coverage grows. Anything still
unchecked after the deploy rehearsal should either be tested or treated as
known residual risk in `TROUBLESHOOTING.md`.
