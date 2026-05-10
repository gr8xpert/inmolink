# Disaster recovery runbook

PLAN §9.2. v1 backup strategy: nightly `pg_dump` to R2 (separate bucket
from media), plus continuous WAL archiving for point-in-time recovery
when an agency reports data loss.

## Backup matrix

| Asset             | Backup path                                | Retention | Method                         |
| ----------------- | ------------------------------------------ | --------- | ------------------------------ |
| Postgres (full)   | `r2://inmolink-backups/db/<date>.sql.gz`   | 30 days   | `pg_dump` nightly via cron     |
| Postgres (WAL)    | `r2://inmolink-backups/wal/<segment>`      | 7 days    | `wal-g push` continuous        |
| Media (R2 bucket) | Cloudflare R2 versioning enabled           | 30 days   | R2-native (no separate copy)   |
| Worker BullMQ     | (no backup — replayable from outbox)        | n/a       | Outbox pattern in app code     |
| Meilisearch       | (no backup — rebuildable via reindex.ts)   | n/a       | `pnpm --filter @inmolink/worker reindex` |
| Redis cache       | (no backup — ephemeral)                    | n/a       | Repopulates on first request   |

## Nightly pg_dump

`/etc/cron.d/inmolink-pgdump` (runs at 02:00 UTC):

```bash
#!/bin/bash
set -euo pipefail
DATE=$(date -u +%Y-%m-%d)
DUMP_FILE=/var/backups/inmolink-$DATE.sql.gz

PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host=localhost \
  --username=inmolink \
  --dbname=inmolink \
  --format=custom \
  --no-owner \
  --no-privileges \
  --jobs=4 \
  --file=- \
  | gzip --best > "$DUMP_FILE"

# Upload via rclone (configure once with rclone config)
rclone copy --progress "$DUMP_FILE" "r2-backups:inmolink-backups/db/"

# Keep last 7 local copies; rclone retention rules handle the bucket side.
find /var/backups -name "inmolink-*.sql.gz" -mtime +7 -delete
```

## WAL archiving (continuous PITR)

`postgresql.conf` additions:

```conf
archive_mode = on
archive_command = 'wal-g wal-push %p'
archive_timeout = 60                 # force a segment switch every 60s
```

Set wal-g env on the postgres user:

```bash
export WALG_S3_PREFIX=s3://inmolink-backups/wal
export AWS_ENDPOINT=https://<r2-account>.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export WALG_COMPRESSION_METHOD=lz4
```

## Restore drills (run quarterly)

### A. Full restore from nightly dump (RPO ~24h, RTO ~30 min)

```bash
# 1. Drop the live DB (verify name first!)
psql -U postgres -c "ALTER DATABASE inmolink RENAME TO inmolink_old_$(date +%s);"
psql -U postgres -c "CREATE DATABASE inmolink OWNER inmolink;"

# 2. Pull the latest dump
rclone copy "r2-backups:inmolink-backups/db/inmolink-$(date -u -d 'yesterday' +%Y-%m-%d).sql.gz" /tmp/

# 3. Restore
gunzip -c /tmp/inmolink-*.sql.gz | pg_restore --dbname=inmolink --no-owner --no-privileges --jobs=4

# 4. Re-apply Prisma migrations IF the dump pre-dates the running migration
pnpm --filter @inmolink/db exec prisma migrate deploy

# 5. Reindex Meilisearch (no DB-side backup of Meili)
pnpm --filter @inmolink/worker reindex

# 6. Restart api + worker
pm2 reload api worker
```

### B. Point-in-time restore (PITR, RPO ~1 min)

Use this when an agency reports "we lost X at 14:32 UTC" — restores to a
specific timestamp using nightly dump + WAL replay.

```bash
# 1. Stop the live cluster
sudo systemctl stop postgresql

# 2. Move PGDATA aside
sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.broken-$(date +%s)
sudo -u postgres mkdir -p /var/lib/postgresql/16/main

# 3. Restore the latest base backup via wal-g
sudo -u postgres bash -c 'wal-g backup-fetch /var/lib/postgresql/16/main LATEST'

# 4. Recovery target — point Postgres at WAL replay end-time
sudo -u postgres tee /var/lib/postgresql/16/main/postgresql.auto.conf > /dev/null <<EOF
restore_command = 'wal-g wal-fetch %f %p'
recovery_target_time = '2026-05-10 14:32:00 UTC'
recovery_target_action = 'promote'
EOF

# 5. Boot
sudo systemctl start postgresql

# 6. Watch the log until it says "archive recovery complete"
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

### C. R2 object versioning (lost media)

R2 bucket versioning gives 30-day window. Use Cloudflare dashboard or:

```bash
# List versions of an object
rclone lsf r2-media:inmolink-media/media/ab/cd/<hash> --include='**' -F 'Modified | Size | Path'

# Restore a specific version (download then re-upload to current generation)
rclone copy --r2-version-at=2026-05-09T12:00:00Z r2-media:... /tmp/restored
rclone copy /tmp/restored r2-media:...
```

## Quarterly checklist

Run a real DR drill on the staging environment **every quarter** and
record the timing. Acceptance:

- Full restore < 30 min from last good nightly dump
- PITR < 60 min for any timestamp inside the 7-day WAL window
- Smoke checks pass after restore (`/api/health/ready`, agency sign-in,
  one ISR public page renders)

If any of those slip, file an issue + update this runbook with the
slow step before closing the drill.
