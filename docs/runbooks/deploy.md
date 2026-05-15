# VPS deploy runbook (Phase 0 — single VPS)

PLAN §2.1, §7. v1 ships everything on one VPS; the `infra/` directory has
the templates referenced below.

## Server target

| Spec        | Minimum | Recommended |
| ----------- | ------- | ----------- |
| vCPU        | 4       | 8           |
| RAM         | 8 GB    | 16 GB       |
| Disk (SSD)  | 100 GB  | 250 GB      |
| OS          | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

Provision via Hetzner / DigitalOcean / Scaleway / OVH — all priced
similarly at this size. EU jurisdiction matters for GDPR.

## First-boot setup

```bash
# As root
adduser inmolink
usermod -aG sudo inmolink
rsync -av ~/.ssh/authorized_keys /home/inmolink/.ssh/authorized_keys
chown -R inmolink:inmolink /home/inmolink/.ssh

# Disable root SSH
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# Firewall — only 22, 80, 443
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Stack install

```bash
# Node 22.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm@10 pm2

# Postgres 16 + pg_stat_statements
sudo apt install -y postgresql-16 postgresql-contrib-16
sudo -u postgres psql -c "CREATE USER inmolink WITH PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE inmolink OWNER inmolink;"
sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# Apply tuning (see infra/postgres/postgresql.conf.tuned + ADR 0004)
sudo cp infra/postgres/postgresql.conf.tuned /etc/postgresql/16/main/conf.d/inmolink.conf
sudo systemctl restart postgresql

# Redis 7
sudo apt install -y redis-server
sudo sed -i 's/^# *requirepass .*/requirepass change-me-redis/' /etc/redis/redis.conf
sudo systemctl restart redis-server

# Meilisearch 1.12
curl -L https://install.meilisearch.com | sh
sudo mv ./meilisearch /usr/local/bin/
sudo useradd -r -s /bin/false meili
sudo mkdir -p /var/lib/meili && sudo chown meili:meili /var/lib/meili
sudo cp nginx/meilisearch.service /etc/systemd/system/meilisearch.service
sudo systemctl daemon-reload
# Set MEILI_MASTER_KEY via override (keeps the key out of the repo):
#   sudo systemctl edit meilisearch
#   (add) [Service]
#         Environment=MEILI_MASTER_KEY=<your-key>
sudo systemctl enable --now meilisearch

# Nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx
# Repo path: nginx/inmolink.conf (the `infra/` prefix in older docs is stale).
sudo cp nginx/inmolink.conf /etc/nginx/sites-available/inmolink
sudo ln -sf /etc/nginx/sites-available/inmolink /etc/nginx/sites-enabled/
# The main config `include`s /etc/nginx/conf.d/cloudflare-ips.conf, so copy
# it before `nginx -t` or the test will fail.
sudo mkdir -p /etc/nginx/conf.d
sudo cp nginx/cloudflare-ips.conf /etc/nginx/conf.d/cloudflare-ips.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d inmolink.eu -d www.inmolink.eu -d api.inmolink.eu -d app.inmolink.eu

# Chromium for Puppeteer PDF brochures/portfolio (Sprint 11). Two options:
#
# Option A — system Chromium (recommended for prod). Smaller, distro-patched.
sudo apt install -y chromium-browser fonts-liberation fonts-noto-color-emoji libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2
# Then set in apps/worker/.env on the VPS:
#   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
#   PUPPETEER_SKIP_DOWNLOAD=true
#
# Option B — Puppeteer's bundled Chrome (matches dev environment exactly).
# Run after `pnpm install` in the App deploy step below:
#   pnpm --filter @inmolink/pdf exec puppeteer browsers install chrome
# ~150 MB download; binary lands in /home/inmolink/.cache/puppeteer/.
```

## App deploy

CI builds in GitHub Actions, then rsyncs the bundle. Initial manual deploy:

```bash
# On the VPS as `inmolink`
cd ~
git clone https://github.com/<org>/inmolink.git
cd inmolink
pnpm install --frozen-lockfile
pnpm prisma migrate deploy   # via @inmolink/db's exec

# Production bootstrap — creates plans + super-admin. Refuses dev defaults
# and never prints the password. Supply via env on one line (avoid shell history):
#   read -s ADMIN_PW; export ADMIN_PW
#   ADMIN_EMAIL=ops@inmolink.eu ADMIN_PASSWORD="$ADMIN_PW" \
#     pnpm --filter @inmolink/db bootstrap:prod
#   unset ADMIN_PW ADMIN_PASSWORD
# Do NOT run `pnpm db:seed` in production — it refuses to start when NODE_ENV=production.
pnpm build                    # all apps via Turbo

# PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd          # follow the printed instructions

# Reindex Meili from existing properties
pnpm --filter @inmolink/worker reindex
```

## Required production env vars

See `.env.example.production` for the annotated list. The non-obvious ones:

```env
# Critical
DATABASE_URL=postgresql://inmolink:<pwd>@localhost:5432/inmolink
REDIS_URL=redis://:<pwd>@localhost:6379
AUTH_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>      # 64 lowercase hex chars

# Storage (R2)
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET=inmolink-media
R2_PUBLIC_BASE_URL=https://images.inmolink.eu

# Public URLs
PUBLIC_BASE_URL=https://inmolink.eu
NEXT_PUBLIC_API_URL=https://api.inmolink.eu

# Stripe (Sprint 7)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY_EUR=price_...
STRIPE_PRICE_PRO_YEARLY_EUR=price_...
STRIPE_TAX_ENABLED=true

# Resend (transactional fallback)
RESEND_API_KEY=re_...
EMAIL_FROM="Inmolink <noreply@inmolink.eu>"

# Anthropic (Claude Haiku for icon suggester)
ANTHROPIC_API_KEY=sk-ant-...

# Cloudflare Turnstile (lead anti-abuse)
TURNSTILE_SECRET=0x4AAAA...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA...

# Better Stack
LOGTAIL_SOURCE_TOKEN=...                   # if shipping logs there
```

## Post-deploy smoke checks

```bash
curl -fsSL https://api.inmolink.eu/api/health/live
curl -fsSL https://api.inmolink.eu/api/health/ready
curl -fsSL https://inmolink.eu/sitemap.xml | head -5
tsx scripts/validate-sitemap.ts https://inmolink.eu
```

## Rollback

```bash
# PM2 saves the last 5 deploys at /home/inmolink/inmolink/.pm2-prev/
pm2 stop all
cd ~/inmolink
git checkout <previous-good-sha>
pnpm install --frozen-lockfile --prefer-offline
pnpm build
pm2 reload ecosystem.config.cjs
```

If a migration is the culprit:

```bash
pnpm --filter @inmolink/db exec prisma migrate resolve --rolled-back <migration-name>
```

(Then revert the schema and ship a follow-up migration that adds back the
column safely. Never `migrate reset` in prod.)

## CI/CD — GitHub Actions

`.github/workflows/deploy.yml` (TBD): on push to `main`, run lint +
typecheck + tests, then rsync the build artefact to the VPS via SSH key
stored in repo secrets, then `pm2 reload all`. Sprint 0 set up the lint+
typecheck workflow; this runbook describes the deploy half that lands as
its own ADR before going live.
