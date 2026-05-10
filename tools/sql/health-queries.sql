-- Inmolink Postgres health queries (PLAN §11.2 / §11.12).
--
-- Run as a privileged user via `psql -f tools/sql/health-queries.sql`. Each
-- block is independent — copy/paste during incident response.

-- ============================================================================
-- 1. Top 20 mean-time queries (drives index/refactor decisions)
-- ============================================================================
SELECT
    substring(query, 1, 200) AS query_snippet,
    calls,
    round(total_exec_time::numeric, 1) AS total_ms,
    round(mean_exec_time::numeric, 2) AS mean_ms,
    round(stddev_exec_time::numeric, 2) AS stddev_ms,
    rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ============================================================================
-- 2. Top 20 by total time (capacity hogs, not just slow)
-- ============================================================================
SELECT
    substring(query, 1, 200) AS query_snippet,
    calls,
    round((total_exec_time / 1000)::numeric, 1) AS total_seconds,
    round(mean_exec_time::numeric, 2) AS mean_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- ============================================================================
-- 3. Index usage — flag idle indexes (write overhead, no read benefit)
-- ============================================================================
SELECT
    schemaname, relname AS table_name, indexrelname AS index_name,
    idx_scan, idx_tup_read, idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan < 50
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 30;

-- ============================================================================
-- 4. Sequential scans on large tables (missing index suspects)
-- ============================================================================
SELECT
    schemaname, relname AS table_name,
    seq_scan, seq_tup_read,
    idx_scan, idx_tup_fetch,
    n_live_tup,
    pg_size_pretty(pg_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 1000
  AND seq_scan > coalesce(idx_scan, 0) * 2
ORDER BY n_live_tup DESC
LIMIT 20;

-- ============================================================================
-- 5. Table bloat estimate (rough — refine via pgstattuple if installed)
-- ============================================================================
SELECT
    schemaname, relname AS table_name,
    n_live_tup, n_dead_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
    pg_size_pretty(pg_relation_size(relid)) AS size,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY dead_pct DESC NULLS LAST
LIMIT 20;

-- ============================================================================
-- 6. Long-running queries (snapshot)
-- ============================================================================
SELECT
    pid,
    state,
    now() - query_start AS runtime,
    wait_event_type, wait_event,
    substring(query, 1, 200) AS query_snippet
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start IS NOT NULL
  AND now() - query_start > interval '5 seconds'
  AND pid <> pg_backend_pid()
ORDER BY runtime DESC;

-- ============================================================================
-- 7. Connection breakdown by application
-- ============================================================================
SELECT application_name, state, count(*)
FROM pg_stat_activity
GROUP BY application_name, state
ORDER BY count(*) DESC;

-- ============================================================================
-- 8. Cache hit rate (target > 99 % for hot tables)
-- ============================================================================
SELECT
    schemaname, relname AS table_name,
    heap_blks_read, heap_blks_hit,
    round(
        100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0),
        2
    ) AS hit_pct
FROM pg_statio_user_tables
WHERE schemaname = 'public'
  AND heap_blks_read + heap_blks_hit > 0
ORDER BY heap_blks_read + heap_blks_hit DESC
LIMIT 15;

-- ============================================================================
-- 9. Reset pg_stat_statements (use after a tuning change to baseline cleanly)
-- ============================================================================
-- SELECT pg_stat_statements_reset();
