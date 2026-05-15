# Troubleshooting log

Real bugs we hit and the root cause + fix. **Newest at the top.**

> **Format for each entry:**
>
> ## YYYY-MM-DD — Short title
> **Symptom**: what the user / system saw
> **Root cause**: what was actually broken (the *real* explanation, not just "we fixed it")
> **Fix**: what we changed (link the commit / PR if there is one)
> **Prevention**: what stops this from happening again — usually a test, a lint rule, a runtime check, or a doc update

---

## 2026-05-15 — Kyero/Generic XML connectors fail on 301 redirects

**Symptom**: Manual feed import against `http://crm.abracasabra.es/property/feed/1/.../Test_feed.xml` reported `Kyero fetch failed: 301 Moved Permanently`. FeedRun marked FAILED with 0 items. Production feed hosts now serve HTTP→HTTPS redirects that the connector refused to follow.

**Root cause**: Both `kyero.ts` and `generic-xml.ts` use `fetch(url, { redirect: "manual" })` to prevent SSRF via cross-host redirect (`assertSafeUrl` only validates the initial URL — a redirect target could be `http://169.254.169.254/...`). Manual mode meant a 3xx response was treated as the final response, so the connector errored out instead of following the safe http→https hop.

**Fix**: Added `packages/imports/src/connectors/safe-fetch.ts` — follows redirects manually with a 5-hop cap and re-runs `assertSafeUrl` on every redirect target before fetching it. Kyero + generic-xml + resale-online (via generic-xml) now use this helper. Manual run after the fix completed in 3s with 272 items.

**Prevention**: Helper is the only path connectors should take to feed URLs; future connectors should import `safeFetchWithRedirects` rather than calling `fetch` directly against `input.feedUrl`.

---

## 2026-05-15 — Redis `allkeys-lru` evicts BullMQ state

**Symptom**: Every BullMQ worker startup logged `IMPORTANT! Eviction policy is allkeys-lru. It should be "noeviction"` (one line per queue). Under sustained load Redis could evict job/state keys and cause stuck or silently-dropped jobs.

**Root cause**: `docker-compose.yml` started Redis with `--maxmemory-policy allkeys-lru`. BullMQ uses Redis as durable state for jobs, schedulers, and locks — eviction of those keys is unsafe.

**Fix**: Switched `docker-compose.yml` redis service to `--maxmemory-policy noeviction`. Runtime `CONFIG SET maxmemory-policy noeviction` applied to the live container too. `CONFIG REWRITE` failed because the container runs without a config file — the docker-compose change is what persists across recreate.

**Prevention**: Document the BullMQ requirement in the deploy runbook. If we ever switch Redis to a managed provider, set the policy explicitly on the instance.

---

## 2026-05-11 — Phase C bench cluster: `seed:bulk` broken, response 500s, k6 hits scrape cap

Four chained issues surfaced once the load bench actually started exercising the public surface against synthetic data. Documented as one entry because they were a single debugging arc.

**Symptom A**: `pnpm --filter @inmolink/worker seed:bulk -- --agencies 10 --properties 1000` failed before a single property was inserted with `Unknown argument 'slug'` on `prisma.propertyType.findFirst({ where: { slug: "house" } })`.

**Root cause A**: `slug` lives on `PropertyTypeTranslation`, not the parent `PropertyType`. The script was written against an outdated schema mental model. `LocationTranslation` has the same shape — it just happened to be queried by `level: "CITY"` so it didn't hit the same error.

**Fix A**: Look up by translation: `prisma.propertyTypeTranslation.findFirst({ where: { slug: "house", locale: "en" }, select: { typeId: true } })`, then construct `{ id: typeTranslation.typeId }` as the FK target.

**Symptom B**: With the seed running, `curl /api/public/properties?limit=2` still returned an empty list.

**Root cause B**: Bulk seed defaulted `visibility: "SHARED"` (visible cross-agency, not on the public marketplace). The public route filters to `visibility: "PUBLIC"` — synthetic rows were correctly excluded.

**Fix B**: Bulk seed now writes `"PUBLIC"`. Existing synthetic rows patched with `UPDATE "Property" SET visibility='PUBLIC' WHERE "ownerAgencyId" IN (SELECT id FROM "Agency" WHERE slug LIKE 'synthetic-agency-%')`.

**Symptom C**: With visibility fixed, the same `curl` returned HTTP 500 `FST_ERR_RESPONSE_SERIALIZATION` — "Response doesn't match the schema".

**Root cause C**: `publicPropertyListItemSchema` enforces `priceType: z.enum(["fixed", "poa", "from"])` — lowercase. The schema.prisma column is plain `String` (Prisma comment: `// 'fixed' | 'poa' | 'from'`), so the database accepted the bulk seed's `"FIXED"`. The string-typed column lost the case discipline that an actual Prisma enum would have caught at write time.

**Fix C**: Bulk seed writes `"fixed"`. Existing rows patched: `UPDATE "Property" SET "priceType"='fixed' WHERE "priceType"='FIXED'`.

**Symptom D**: With C fixed, the k6 public run reported `search 200` failing 93%, `http_req_failed: 75%`.

**Root cause D**: `/api/public/properties` has its own per-route rate limit (`config.rateLimit = { max: 120, timeWindow: "1 minute" }`) for scrape defence. At 50 VUs / one IP issuing ~20 search req/s, the test cleared 120 in the first 6 s and then 429'd for the remaining 5 minutes. Latency on the green 7 % was fine (p95 ~ 35 ms) — the limiter was doing exactly its job, just at a value too tight for a one-IP bench.

**Fix D**: Parameterised the cap via `PUBLIC_LIST_RATE_LIMIT_MAX` + `PUBLIC_LIST_RATE_LIMIT_WINDOW` env vars. Reads `process.env` directly inside `apps/api/src/modules/public/property-routes.ts` rather than threading through `config.ts`, since this is a bench-time knob, not load-bearing config. Default unchanged at 120 — prod stays exactly as it was. Bench raised it to 100000.

**Symptom E**: `tools/k6/public.js` `search` iterations threw `ReferenceError: URLSearchParams is not defined`.

**Root cause E**: k6 runs scripts in Goja (Go-implemented ES5.1+), which doesn't ship `URLSearchParams`. The script was authored against Node/browser globals.

**Fix E**: Replaced with a manual `qs()` helper inside `public.js` that `encodeURIComponent`s and joins with `&`.

**Prevention**: (1) Run `seed:bulk` in CI smoke against a throwaway PG — catches A/B/C in CI before they bite a bench. (2) Promote `priceType` to an actual Prisma enum so the typecheck catches uppercase at write time (deferred — touches Property model and existing data). (3) Note in `tools/k6/README.md` that one-IP benches need `PUBLIC_LIST_RATE_LIMIT_MAX` raised. (4) k6 scripts shouldn't depend on browser globals — already documented.

---

## 2026-05-11 — Profile form Save does nothing (no API call, no error visible)

**Symptom**: on `/dashboard/settings/profile`, the form renders, the user edits fields and clicks "Save changes", and nothing happens. No success/error toast, no API request hits the server (`/api/dashboard/me/profile` PATCH never appears in the access log). The user thinks the form is broken.

**Root cause**: the EN translation `settings.profile.slugHint` was `"Used in your public agent URL: /agent/<slug>"`. next-intl uses ICU MessageFormat under the hood, which treats `<tag>...</tag>` as rich-text formatting. The bare `<slug>` is parsed as an *opening tag with no closing tag*, so the parser throws `INVALID_MESSAGE: UNCLOSED_TAG`. The error surfaces during render of the slug Field at `profile-form.tsx:93:38`. Next.js dev mode catches it as an error boundary, which freezes that subtree — the rest of the form keeps rendering, but `formState` is corrupted enough that `handleSubmit` doesn't fire `onSubmit`. Same pattern in 8 places (slugHint × en/es/de/fr × agent/agency forms).

**Fix**: replaced `/agent/<slug>` and `/agency/<slug>` with `/agent/[slug]` and `/agency/[slug]` in all four locale message files (`apps/web/messages/{en,es,de,fr}.json`). `[slug]` is conventional URL-routing notation and not parsed by ICU. Same brackets are used by Next.js's own `app/[locale]/...` segment syntax, so visual consistency is a bonus.

**Prevention**: never put bare `<word>` in a next-intl translated string. If a tag-like literal is needed, escape via ICU apostrophes (`'<'slug'>'`) or — better — use a different placeholder convention. Lint candidate: scan every `messages/*.json` value for `<[a-z][a-z_-]*>` not followed by `</…>` and fail CI.

**Side note**: the original user-visible symptom ("Save does nothing") was deeply misleading — it took finding the dev-mode error trace in the api log to spot the underlying ICU parse error. A real client-side error overlay (Next.js error overlay must have been suppressed or wasn't escalating this render error) would have surfaced the cause immediately.

---

## 2026-05-11 — Featured listing cards on public homepage rendered without a thumbnail

**Symptom**: featured-listings admin curates a property → public homepage shows the property card with title/price/agency badge but **no image**. `/api/public/featured-listings` returns `coverImageHash: null` even when the property has uploaded images and worker-generated variants on disk.

**Root cause**: `attachPropertyImages` in `apps/api/src/modules/properties/images/service.ts` only marks a `PropertyImage` row as `isCover: true` when the client explicitly requests it (`req.images[*].isCover === true`). The upload widget (`apps/web/.../image-uploader.tsx` line 209) only sends `{ mediaObjectId }` with no cover hint. Result: every uploaded image lands with `isCover: false`, so the property has no cover at all. The featured projection in `featured-service.ts:166` filters by `isCover: true` → finds nothing → returns `coverImageHash: null` → the homepage card has no `src`.

**Fix**: `apps/api/src/modules/properties/images/service.ts` — count existing covers before the transaction; if zero AND the client didn't request one, set the first attached image as cover. Self-healing for any future upload via this codepath (manual uploads, imports, etc.). Existing data needs a one-off SQL flip: `UPDATE "PropertyImage" SET "isCover" = true WHERE id IN (SELECT DISTINCT ON ("propertyId") id FROM "PropertyImage" WHERE "propertyId" IN (SELECT id FROM "Property" WHERE id NOT IN (SELECT "propertyId" FROM "PropertyImage" WHERE "isCover" = true)) ORDER BY "propertyId", "position", "createdAt")` — though for our local-only data we just flipped Test Sprint 1's first image manually.

**Prevention**: this is two pieces of code making opposite assumptions. The widget thought "the server will figure out cover". The server thought "the client will tell us". Future-proof by either (a) keeping today's auto-promote logic and adding a vitest to lock it in, or (b) shifting the policy to the client and forbidding `isCover: false` on first image. Today's fix is the safer of the two — server-authoritative, works for any new caller (import pipeline, future bulk-upload tools).

---

## 2026-05-11 — Public search returns HTTP 500 on empty Meilisearch index

**Symptom**: `/api/public/properties?q=...` returns `{"statusCode":500,"message":"Index \`properties_en\` not found."}` on a fresh deployment with zero PUBLIC properties — the Meilisearch index for that locale doesn't exist yet because the worker creates it lazily on the first upsert via OUTBOX_DRAIN.

**Root cause**: `MeilisearchAdapter.search()` in `packages/search/src/meilisearch-adapter.ts` propagated any `MeiliSearchApiError` as a 500. The `index_not_found` case is normal at boot and on locales with no published properties — should not surface as a server error to anonymous users.

**Fix**: catch + match `err.cause?.code === "index_not_found"` and return an empty `SearchResult` (`hits: [], totalHits: 0`). Any other Meilisearch error still bubbles. Note: the SDK puts the actionable code under `err.cause.code`, not `err.code` — discovered while debugging.

**Prevention**: same pattern applies to any external service that creates resources lazily — the API layer should distinguish "service down" (500) from "resource not yet populated" (empty result). Worth adding a vitest case that searches against a fresh Meili and asserts `{hits: []}`.

---

## 2026-05-11 — Auto-slug stops updating after the first keystroke

**Symptom**: in every locale-translated admin form (locations, location groups, property types), typing into the Name field auto-fills the Slug correctly for the first character only. From the second keystroke onward the slug freezes at the first letter while the name keeps growing — e.g. typing "Marbella" yields `name="Marbella", slug="m"`.

**Root cause**: the auto-slug expression was:

```js
slug: t[loc].slug || slugify(e.target.value),
```

After the first keystroke, `t[loc].slug` becomes truthy (e.g. `"m"`), so `||` short-circuits to the existing slug and skips the new `slugify(...)` call. The comment claimed "Auto-slug only if slug is blank" — which is exactly what the code does, but the intent was "keep auto-syncing the slug until the user manually edits the slug field". Those aren't the same.

**Fix**: switched to a "current slug equals the auto-slug of the previous name" check across all 4 sites (locations, location-groups, property-types — two forms in property-types):

```js
slug:
  t[loc].slug === slugify(t[loc].name)
    ? slugify(e.target.value)
    : t[loc].slug,
```

This keeps re-deriving the slug as the user types in Name, but stops the moment the slug diverges from `slugify(name)` — i.e. the user typed a custom slug. Pure, no extra state, no `touched` flag.

**Edge case**: if a user types a slug that *happens* to equal `slugify(name)` and then keeps typing in Name, the slug will follow Name. That's fine — they had no manual override yet.

**Prevention**: this is a class-of-bug — anywhere we conditionally derive one field from another via `||`, the same trap exists. Worth a unit test for the slug-auto-sync helper if we ever extract it into shared util.

---

## 2026-05-11 — Admin forms render 4 copies of every locale-translated input

**Symptom**: on every admin curation form that supports the en/es/de/fr locales (property types, features, locations, location groups, property create/edit), the locale tabs render correctly but the NAME/SLUG (or title/description) input pairs render **all four locales at once** stacked vertically, instead of swapping based on the active tab. User can't tell which row maps to which locale — typing into what looks like the "EN" row may actually be writing to ES/DE/FR state, so the EN translation submits empty. Explains the user-reported "slug field doesn't take value fully" — they were filling the wrong row.

**Root cause**: 7 components used the HTML `hidden` attribute paired with a Tailwind display class on the same element:

```jsx
<div hidden={activeTab !== loc} className="grid gap-2 sm:grid-cols-2">
```

The Tailwind `grid` (and `space-y-*` / `flex` / etc.) utilities set `display: grid` (etc.) via a CSS rule with specificity (0,1,0). The HTML `hidden` attribute's `display: none` comes from a user-agent stylesheet with lower specificity, so the className **wins** and the element stays visible.

This is a well-documented Tailwind footgun — see the official Tailwind docs note on `hidden` interacting with other display utilities. Affected files (all in `apps/web/app/[locale]/dashboard/`):
- `admin/property-types/admin-property-types.tsx:361, 675` (with `grid`)
- `admin/locations/admin-locations.tsx:673` (with `grid`)
- `admin/location-groups/admin-location-groups.tsx:420` (with `grid`)
- `admin/features/admin-features.tsx:317, 511` (no `display` class — these two were technically fine, but fixed for consistency)
- `properties/_components/property-form.tsx:397` (with `space-y-3` — `space-y-*` does NOT set display, so this one was probably already working, but fixed for consistency)

**Fix**: replaced `hidden={...}` with `style={... ? { display: "none" } : undefined}` everywhere. Inline `style` has specificity (1,0,0,0) which beats any className. Single-line diff per site; preserves the existing className intact.

**Prevention**: lint rule to forbid the combination of `hidden={...}` and a `display: *` Tailwind utility on the same element. Or replace the pattern entirely with conditional rendering (`activeTab === loc && <Pane />`) — also kills the bug, simpler JSX, but loses field state when switching tabs. We chose `style.display` because the inputs are controlled (state lives in React, not DOM), so the trade-off doesn't bite us here.

---

## 2026-05-11 — Property detail page renders twice (open — defer to frontend pass)

**Symptom**: on `/[locale]/dashboard/properties/[id]`, the page header (`#id` + title + Edit / All-properties buttons) and full detail grid (price, transaction, bedrooms, etc.) appear **twice** in vertical sequence — first instance shows "No images attached", second instance shows the actual image-manager with uploaded images. Persists across hard refresh.

**Source verified clean**:
- `apps/web/app/[locale]/dashboard/properties/[id]/page.tsx` has exactly one `<header>` + one detail `<section>` + one ImageManager + one ImageUploader.
- Only layout in the tree is `app/[locale]/layout.tsx` — no parallel routes, no template.tsx, no `@`-slots.
- API access logs show single GET pairs per pageview (one detail + one images), not doubled.

**Hypotheses to test next**:
1. Some component below the page (e.g. the dashboard sidebar, breadcrumb, or a `not-found` boundary) is rendering a second copy of the property header. Need to inspect the rendered DOM in DevTools and count `<h1>Test Sprint 1</h1>` occurrences.
2. The screencapture tool is stitching together two render states (less likely — user confirms duplication is visible without the tool).
3. A React error boundary catching mid-render and re-rendering the children, leaving stale DOM. Less likely with Server Components but worth ruling out by checking the React error overlay.

**Workaround**: none — purely cosmetic. Backend is correct (single fetch per pageview); image pipeline is correct (DB rows + variants + file system intact). User can ignore the duplicate block.

**Status**: deferred to the frontend hardening pass. Tag: `B.S1-defer`.

---

## 2026-05-11 — Image thumbnails render as broken icons in dashboard (dev mode)

**Symptom**: after uploading an image to a property in dev, the image-manager renders a black square with a broken-image icon. The image-variant pipeline ran (worker log shows variants generated, `MediaVariant` rows exist, files on disk under `tmp/r2-local/variants/...`), and the `/api/_local-storage/serve?key=...` endpoint returns HTTP 200 with the full bytes when hit directly with curl — but the browser refuses to load it.

**Root cause**: two compounding problems on the dev-only `/_local-storage/serve` route:

1. **Cross-Origin-Resource-Policy: same-origin** (Helmet default). The dashboard runs at `http://localhost:3000` and the api at `http://localhost:3001` — different ports → different origins. Modern browsers honour CORP and block embedding of cross-origin responses unless the server opts in with `cross-origin` (or `same-site`). The dev `<img src="http://localhost:3001/api/_local-storage/serve?...">` was being blocked at the rendering stage. R2's CDN domain in production has its own CORP config, so this only ever bites in dev.

2. **content-type always `application/octet-stream`**. Storage keys are content-addressed hashes (no extension), so the route has no way to know the mime type from the URL alone. Browsers do mime-sniffing for `<img>`, so a PNG would still display when CORP allowed it — but combining the octet-stream content-type with `X-Content-Type-Options: nosniff` (also a Helmet default) means strict browsers refuse to treat the response as an image even when CORP is open.

**Fix**: `apps/api/src/routes/local-storage.ts` — the `/serve` handler now (a) sets `Cross-Origin-Resource-Policy: cross-origin` per-response (overriding Helmet's default for this dev-only route), and (b) sniffs magic bytes from the response buffer to set an accurate `content-type` (PNG, JPEG, GIF, WebP, AVIF, HEIC, PDF, MP4 — falls back to octet-stream for anything else). Production R2 is unaffected — content-type is stored on the object at upload time and served straight from R2.

**Prevention**: this route is dev-only and not regression-tested via vitest (would need a Fastify e2e harness). The fix is small and self-contained, so the simplest safeguard is the next time a dev mounts a different image format that we don't recognise, the worst case is "thumbnail renders without optimisation" rather than "broken icon". If we expand supported formats, extend `sniffContentType()` accordingly. In any case, image rendering should be re-verified as part of the next Phase B smoke after S1 changes.

---

## 2026-05-11 — Image upload + worker schedulers crash with "Custom Id cannot contain :"

**Symptom**: First image upload on a property fails with HTTP 500 from `POST /api/uploads/register`. Server log: `Error: Custom Id cannot contain :`. The widget shows "Error" badge on the file row. Same error would have hit `webhook-dispatcher`, `campaign-dispatcher`, export queue, manual sitemap regenerate, and manual feed-import re-run the moment any of them tried to enqueue real work (none had pending data yet in our session).

**Root cause**: BullMQ v5 (we run `^5.34.0` in both `apps/api` and `apps/worker`) **rejects** custom `jobId` values containing `:`, because `:` is the internal Redis key separator and would collide with BullMQ's own keyspace. We had 7 sites building deterministic job IDs with `:` as a separator (image variants, exports, sitemap manual, feed-import manual, email recipients in both api and worker dispatchers, webhook deliveries). All would fail the moment they were exercised. The bug had been silent because no traffic had reached the queues until this manual smoke.

The image variant helper lives in `packages/shared` (`schemas/media.ts::imageVariantJobId`); the other 6 are inline template literals in their respective producers. We carried the `:` pattern from BullMQ v3/v4 docs without checking the v5 changelog.

**Fix**: replaced `:` with `-` everywhere a custom jobId is constructed. Format remains deterministic so BullMQ dedup still works:
- `packages/shared/src/schemas/media.ts:71` — `iv-${hash}-${size}-${format}-v${ver}`
- `apps/api/src/lib/queues.ts:72,148` — `sitemap-manual-${ts}` / `feed-import-manual-${id}-${ts}`
- `apps/api/src/modules/exports/service.ts:168` — `export-${id}`
- `apps/api/src/modules/marketing/campaign-service.ts:313` — `email-recipient-${id}`
- `apps/worker/src/processors/campaign-dispatcher/processor.ts:100` — same
- `apps/worker/src/processors/webhook-dispatcher/processor.ts:39` — `wh-deliver-${id}`

`feedImportSchedulerId()` (`feed-import:scheduler:<id>`) is **not** affected — it's passed to `upsertJobScheduler()`, not as `opts.jobId` on `queue.add()`. The `:` restriction only applies to user-provided custom job IDs.

**Prevention**: add a lint rule or unit test for `/jobId\s*:\s*[`"']?[^,}]*:/` against the `apps/**` and `packages/**` source trees. Long-term, centralise jobId construction behind a typed `makeJobId(parts: string[])` helper in `packages/shared` that joins on `-` and rejects `:` in inputs — kills the whole class at the source.

---

## 2026-05-11 — `apps/public` 500s on `/en` with `NEXT_PUBLIC_TURNSTILE_SITE_KEY: String must contain at least 1 character(s)`

**Symptom**: Fresh local `pnpm dev` boots all four apps, but every request to the public marketplace returns HTTP 500. Stack trace points at `apps/public/src/env.ts` Zod schema rejecting `NEXT_PUBLIC_TURNSTILE_SITE_KEY` even though `.env.example` documents it as optional ("when unset, leads submit without verification").

**Root cause**: `apps/public/.env` ships `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` (empty string) by default. Zod's `z.string().min(1).optional()` accepts `undefined` but rejects `""` — `.optional()` is not the same as "treat empty string as absent". The schema was correct in intent but wrong in practice for any `.env` file that declared the var with an empty value.

**Fix**: `apps/public/src/env.ts` — coerce empty strings to `undefined` before passing to `safeParse` via a `nonEmpty()` helper.

**Prevention**: same pattern should apply to every `NEXT_PUBLIC_*` (and ideally every) env var that's documented optional but might be declared empty in `.env`. Worth a follow-up sweep across `apps/{api,web,worker}/src/config.ts` to verify their Zod schemas do the same. Long-term, the cleanest move is a shared `optionalString()` Zod helper in `@inmolink/shared`.

---

## 2026-05-11 — Meilisearch container stuck `unhealthy` despite serving healthy responses

**Symptom**: `docker ps` shows `inmolink-meilisearch ... (unhealthy)`, but `curl http://localhost:7700/health` returns `{"status":"available"}` HTTP 200. App connectivity works; only docker's container-level healthcheck fails.

**Root cause**: docker-compose.yml ran the healthcheck via `wget --spider 'http://localhost:7700/health'`. BusyBox wget inside the Meilisearch image resolves `localhost` to IPv6 `[::1]:7700`, but Meilisearch binds IPv4-only on `0.0.0.0:7700`. The TCP connect refuses; healthcheck fails with `wget: can't connect to remote host: Connection refused`.

**Fix**: changed the healthcheck URL to `http://127.0.0.1:7700/health` in `docker-compose.yml`. Forces IPv4. Container flipped to `healthy` within 5s of recreate.

**Prevention**: never use `localhost` inside container healthchecks when the service bind is IPv4-only. Always use `127.0.0.1` explicitly (or `[::1]` if the service also listens on IPv6). Affects any BusyBox/Alpine-based image — they default to IPv6-first resolution.

---

## 2026-05-09 — `prisma generate` fails with EPERM rename on `query_engine-windows.dll.node`

**Symptom**: `pnpm --filter @inmolink/db db:generate` (or any operation that triggers `prisma generate`, including `prisma migrate dev`) fails on Windows with:

```
EPERM: operation not permitted, rename
'…/.prisma/client/query_engine-windows.dll.node.tmp9196'
-> '…/.prisma/client/query_engine-windows.dll.node'
```

The migration SQL still applies cleanly to Postgres + the migration file is created — only the client codegen step fails. Result: the DB is ahead of the generated TypeScript types, so any new schema field surfaces as a TS error in code that uses it.

**Root cause**: Prisma writes the new query engine binary to a `.tmp*` file then atomically renames it. Windows refuses the rename when **any process has the existing DLL loaded**. In this monorepo that's any of the dev servers (`apps/api`, `apps/web`, `apps/public`, `apps/worker`) running under `tsx watch` / `next dev` — they all import `@prisma/client`, which lazy-loads the engine. POSIX systems silently overwrite mapped files; Windows enforces the lock.

Notably the lock survives `Ctrl+C` of the watcher if a `tsx`/`node` child process leaks. PM2-managed runs are also susceptible.

**Fix (this session)**: `taskkill /F /IM node.exe` to clear all Node processes, then re-run `pnpm --filter @inmolink/db db:generate`. Worked first try once nothing held the DLL.

**Side effect**: kills *every* `node.exe` on the box — including `claude-code` MCP servers (we lost the `context-mode` plugin until next session restart). Only run when you can afford to lose all Node processes.

**Less destructive alternatives**:
1. **Stop only this repo's dev servers** before running migrate/generate (`pnpm dev` Ctrl+C, plus check for orphaned `tsx`/`next-server` PIDs in Task Manager).
2. **Add `db:generate:safe` script** that does it in a freshly-spawned shell with all watchers down — not yet wired up.
3. **Migrate inside the repo's docker-compose** (Postgres) but run `prisma generate` from a one-shot container with no shared volume on the dll path. Heavier.
4. *(Long-term)* On Windows-heavy teams, bump to Prisma's WASM driver adapter (`@prisma/adapter-pg` + `prismaSchemaFolder` preview) — eliminates the native DLL altogether. Requires schema changes and isn't drop-in today.

**Prevention**:
- Treat any `pnpm db:migrate:dev` / `pnpm db:generate` on Windows as an operation that needs **no dev watchers running**. Add a heads-up to the README's local-dev section.
- If the migration SQL has already applied to Postgres but `generate` failed, you can re-run `pnpm db:generate` standalone after stopping watchers — no need to re-run the migration. The `prisma_migrations` table tracks state and won't double-apply.

---

## 2026-05-09 — Git push hangs silently with Windows Git Credential Manager

**Symptom**: After the first successful `git push` (which used cached creds), subsequent pushes hang indefinitely with no terminal output. `GIT_TERMINAL_PROMPT=0` doesn't surface any error.

**Root cause**: Git remote uses HTTPS with `credential.helper=manager` (Windows Git Credential Manager). When credentials expire or aren't cached, GCM shows an interactive popup window — invisible to non-interactive shell sessions (Claude Code Bash tool, CI runners, headless terminals). The git process blocks waiting for popup interaction that can never come.

**Confirmation**: Forcing `-c credential.helper=` to bypass GCM produced the actual error immediately:
```
remote: No anonymous write access.
fatal: Authentication failed for 'https://github.com/gr8xpert/inmolink.git/'
```

**Fix (this session)**: Continued autonomous work as local commits only. User pushes manually when they return — single `git push origin main` sends all queued commits.

**Permanent fix options (pick one when convenient)**:
1. **Personal Access Token (PAT)** — set once, never blocks. Generate at https://github.com/settings/tokens (classic, scope `repo`), then:
   ```
   git config --global credential.helper store
   git push  # enter username + PAT once when prompted; cached forever
   ```
2. **SSH remote** — change remote URL and use SSH keys:
   ```
   git remote set-url origin git@github.com:gr8xpert/inmolink.git
   ```
   Requires `ssh-keygen` + adding public key to https://github.com/settings/keys.
3. **gh CLI auth** — install GitHub CLI, run `gh auth login`. CLI handles auth refresh transparently.

**Prevention**: For automation / CI / agent-driven workflows, always use PAT or SSH. GCM is for interactive humans only.
