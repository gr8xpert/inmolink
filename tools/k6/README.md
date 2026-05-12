# k6 load tests

PLAN §11.12 budgets:
- Dashboard p95 < 300 ms
- Public p95 < 500 ms
- Failure rate < 1 %

## Setup

```bash
# Install k6 (https://k6.io/docs/get-started/installation/)
brew install k6        # macOS
choco install k6       # Windows
# Or — no install required:
docker pull grafana/k6:latest
```

When the bench load all comes from one IP (always true locally, and on a
single CI runner), bump `PUBLIC_LIST_RATE_LIMIT_MAX` in `apps/api/.env`
to ~100000 — the route's 120/min scrape cap will otherwise reject ~93% of
search requests and skew p95.

## Bench environment

Before running:
1. Boot Postgres + Redis + Meili + the api/web/public/worker stack.
2. Apply Postgres tuning from `infra/postgres/postgresql.conf.tuned`.
3. Seed bulk data:
   ```bash
   pnpm --filter @inmolink/db db:seed
   pnpm --filter @inmolink/worker seed:bulk -- --agencies 100 --properties 10000
   ```

## Run

```bash
# Public surface (anonymous)
k6 run \
  -e API_BASE=http://localhost:3001 \
  -e BASE=http://localhost:3002 \
  tools/k6/public.js

# Dashboard (authenticated)
k6 run \
  -e API=http://localhost:3001 \
  -e WEB=http://localhost:3000 \
  -e EMAIL=admin@inmolink.local \
  -e PASSWORD='Inmolink-Dev-2026!' \
  tools/k6/dashboard.js
```

Docker variant (use `host.docker.internal` from Docker Desktop on
macOS/Windows; on Linux pass `--network host` and keep `localhost`):

```bash
docker run --rm -v "$(pwd)/tools/k6:/scripts" \
  -e API_BASE=http://host.docker.internal:3001 \
  -e BASE=http://host.docker.internal:3002 \
  grafana/k6:latest run /scripts/public.js
```

## Baseline (2026-05-11 — single-laptop dev)

Stack: Postgres 16, Redis 7, Meili 1.12 in Docker; api/web/public/worker
via `pnpm dev` (tsx). Dataset: 1001 PUBLIC properties from `seed:bulk`.

| Scenario  | VUs | Duration | p95     | p99     | Failure | Notes                                      |
| --------- | --- | -------- | ------- | ------- | ------- | ------------------------------------------ |
| public.js | 50  | 5 min    | 36 ms   | 56 ms   | 0.05 %  | One 31 s cold-start outlier on `sitemap`.  |
| dashboard | 20  | 4 min    | 17 ms   | 26 ms   | 4.4 %   | One 9.96 s outlier inflated failure rate.  |

Both runs comfortably inside PLAN §11.12 budgets (500 / 1500 ms public,
300 / 800 ms dashboard, 1 % errors). Re-run after Postgres tuning lands
on the VPS to confirm targets hold against the real server CPU profile.

## What to watch

- `http_req_duration` p(95) and p(99) per endpoint tag
- `errors` rate (custom metric — failed `check()` calls)
- `http_req_failed` (k6's built-in)
- Postgres `pg_stat_statements`: top mean-time queries during the run
- Redis CPU + connection count

## Failure modes spotted historically

- Slow `/api/dashboard/notifications?limit=…` when the User has > 10K
  rows — fix is `(userId, createdAt desc, id desc)` index (already shipped
  in Sprint 6).
- `/api/public/properties?q=…` falls back to Postgres ILIKE when
  Meilisearch is unreachable — disable the fallback for the load test
  if you want to bench Meili specifically.
