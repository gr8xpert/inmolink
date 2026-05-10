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
```

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
