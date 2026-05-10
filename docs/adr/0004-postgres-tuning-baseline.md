# ADR 0004 — Postgres tuning baseline (16 GB / 8 vCPU VPS)

**Status**: Accepted (Sprint 12)
**Date**: 2026-05-10
**Related**: PLAN §7 (Scaling Phases), §11.2, §11.12; `infra/postgres/postgresql.conf.tuned`

## Context

PLAN §7 commits Phase 0 to a single VPS with co-located Postgres + Redis +
Meili + workers + apps. The default Postgres config ships conservative
memory limits and assumes spinning disks; both are wrong for our target
hardware. We need an explicit baseline so:

1. Anyone provisioning the v1 VPS gets predictable performance.
2. Tuning changes are tracked over time (PLAN §7 phase triggers).
3. Sprint 12 load tests have a stable target to compare against.

## Decision

Apply the values in `infra/postgres/postgresql.conf.tuned` on first boot.
Key settings:

| Setting                              | Value          | Why                                                                  |
| ------------------------------------ | -------------- | -------------------------------------------------------------------- |
| `shared_buffers`                     | `4GB`          | ~25% of 16GB RAM — standard guidance for OLTP                        |
| `effective_cache_size`               | `12GB`         | ~75% of RAM; advisory for the planner                                |
| `work_mem`                           | `32MB`         | Per-sort/hash node; capped to keep `max_connections × work_mem` safe |
| `maintenance_work_mem`               | `1GB`          | Faster autovacuum + CREATE INDEX                                     |
| `max_connections`                    | `200`          | Beyond this we add PgBouncer (Phase 2 trigger)                       |
| `random_page_cost`                   | `1.1`          | Default 4.0 mis-prices SSD random IO                                 |
| `effective_io_concurrency`           | `200`          | SSD-friendly (Phase 7+ NVMe → 256)                                   |
| `autovacuum_vacuum_scale_factor`     | `0.05`         | Default 0.2 lets dead tuples accumulate                              |
| `autovacuum_max_workers`             | `4`            | Keep up with our write-heavy `Property` + `MediaObject` tables       |
| `log_min_duration_statement`         | `200ms`        | Surfaces slow queries without flooding the log                       |
| `pg_stat_statements`                 | preloaded      | Required for `tools/sql/health-queries.sql`                          |
| `statement_timeout`                  | `30s`          | Kill runaway queries; raise per-session for migrations               |
| `idle_in_transaction_session_timeout`| `60s`          | Reaps abandoned transactions that block writes                       |

## Phase triggers (PLAN §7)

| Phase | Trigger                                | Action                                                           |
| ----- | -------------------------------------- | ---------------------------------------------------------------- |
| 1     | DB CPU > 70% sustained / p95 > 200 ms  | Add indexes per `health-queries.sql §4`; raise `default_statistics_target` for hot columns |
| 2     | > 200 concurrent users                 | Add PgBouncer in transaction pooling mode (per ADR 0005 — TBD)   |
| 3     | DB box > 80% disk / > 1000 concurrent  | Move Postgres to managed (Neon / Crunchy) or sibling box         |
| 5–7   | RAM pressure + cross-region traffic    | Read replica → logical sharding by `countryCode` (per future ADR)|

Each trigger gets its own ADR before executing.

## Consequences

- Reproducible perf. The k6 baselines in `tools/k6/` are calibrated
  against this config; deviating breaks comparison.
- Memory is allocated up front (`shared_buffers`), so the VPS needs
  16 GB *minimum*. 12 GB instances get OOM-killed during autovacuum
  bursts.
- `statement_timeout` will trip honest-but-slow queries during data
  imports — Sprint 5's import worker raises it per session via
  `SET LOCAL statement_timeout` for that reason.

## Operational checks

After applying, verify:
```bash
psql -c "SHOW shared_buffers;"          # → 4GB
psql -c "SELECT name, setting FROM pg_settings WHERE name IN
         ('work_mem','effective_cache_size','random_page_cost',
          'autovacuum_vacuum_scale_factor');"
psql -c "SELECT * FROM pg_stat_statements LIMIT 1;"  # extension loaded
```
