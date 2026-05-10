# Monitoring runbook

PLAN §9.4. v1 monitoring stack:

- **Liveness/readiness**: `GET /api/health/live` and `/api/health/ready` on the api
- **External uptime**: Better Stack (preferred) or Uptime Robot (free tier)
- **Logs**: Pino structured JSON → Better Stack Logs (or any drain that takes JSON)
- **Postgres**: `pg_stat_statements` + `tools/sql/health-queries.sql`
- **Redis**: `redis-cli INFO` + Better Stack Redis check
- **R2**: Cloudflare dashboard (no separate check; api 5xx surfaces R2 issues)
- **Worker**: BullMQ dashboards (planned: bull-board behind super-admin auth)

## Endpoints to monitor

| URL                                            | Expectation       | Frequency |
| ---------------------------------------------- | ----------------- | --------- |
| `https://api.inmolink.eu/api/health/live`      | 200, `{status:"ok"}` | 60 s      |
| `https://api.inmolink.eu/api/health/ready`     | 200, `db:ok, redis:ok` | 60 s |
| `https://inmolink.eu/`                         | 200                | 60 s      |
| `https://app.inmolink.eu/en/sign-in`           | 200                | 5 min     |
| `https://api.inmolink.eu/api/public/properties?limit=1` | 200, JSON | 5 min     |

## Better Stack heartbeats (worker)

Each worker scheduler should ping a Better Stack heartbeat URL **after**
its tick completes. This catches "scheduler stopped firing" failures that
liveness alone wouldn't.

```env
# .env on the worker
BETTER_STACK_HEARTBEAT_MEDIA_CLEANUP=https://uptime.betterstack.com/api/v1/heartbeat/abc123
BETTER_STACK_HEARTBEAT_OUTBOX_DRAIN=https://uptime.betterstack.com/api/v1/heartbeat/def456
BETTER_STACK_HEARTBEAT_NOTIFICATION_DIGEST=https://uptime.betterstack.com/api/v1/heartbeat/ghi789
BETTER_STACK_HEARTBEAT_VIEWING_EXPIRE=...
BETTER_STACK_HEARTBEAT_SITEMAP_GENERATE=...
BETTER_STACK_HEARTBEAT_CAMPAIGN_DISPATCHER=...
BETTER_STACK_HEARTBEAT_WEBHOOK_DISPATCHER=...
BETTER_STACK_HEARTBEAT_EXPORT_CLEANUP=...
```

Wire by appending to each scheduler's tick (deferred — see CHECKLIST 12.D
"Deferred"). Fail-soft: heartbeat ping errors must not break the tick.

## Alert routing

Severity → channel:
- `down`: Slack `#oncall` + SMS to oncall phone
- `degraded` (one of redis/db down but live): Slack `#oncall`
- `slow` (p95 > budget): Slack `#perf`

Suppress duplicate alerts within 10 min — Better Stack and Uptime Robot
both support this natively.

## Pino log shipping

Pino emits JSON; pipe stdout to a log shipper. Two options for v1:

1. **Better Stack Logs** — set `LOGTAIL_SOURCE_TOKEN` and switch the
   transport to `@logtail/pino`. Direct from the process; no agent.
2. **Self-hosted Loki** — write `journalctl` output via `promtail`. More
   moving parts; only worth it if you already run Grafana.

Either way, **redact PII** at the api/worker layer (already done in
`apps/api/src/app.ts` `redact:` block + worker logger setup) so no
agent-side rule is required.

## Incident response cheat-sheet

```bash
# Are we live?
curl -s https://api.inmolink.eu/api/health/live | jq

# Are deps healthy?
curl -s https://api.inmolink.eu/api/health/ready | jq

# Slow query culprits
psql -U inmolink -d inmolink -f tools/sql/health-queries.sql

# Redis pulse
redis-cli -h <host> INFO stats | grep -E "instantaneous|connected_clients|total_commands"

# Worker queue depth
redis-cli -h <host> KEYS "bull:*:wait" | head
redis-cli -h <host> LLEN bull:image-variant:wait
redis-cli -h <host> LLEN bull:webhook-deliver:wait

# Restart api / worker (PM2)
pm2 reload api
pm2 reload worker
pm2 logs api --lines 200
```
