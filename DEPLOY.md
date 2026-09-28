# Deploying Acceleron Plus with pm2 (Ubuntu)

The app runs as one `next start` process under pm2, listening on
`127.0.0.1:3000`. nginx sits in front and terminates HTTPS. A second pm2
entry fires the daily overdue-milestone sweep.

```
browser ──https──▶ nginx :443 ──▶ 127.0.0.1:3000  pm2: acceleron-plus
                                                 pm2: acceleron-sweep (08:00 daily)
                                  PostgreSQL: identity_db, project_db, itsm_db, execution_db
```

| File | Purpose |
|---|---|
| `ecosystem.config.js` | pm2 process definitions (app + sweep) |
| `scripts/deploy.sh` | install → migrate (optional) → build → pm2 reload → health check |
| `scripts/notification-sweep.js` | calls `POST /api/notifications/sweep` with the sweep token |
| `deploy/nginx/acceleron-plus.conf` | reverse-proxy site (50 MB uploads, forwarded headers) |

Commands below assume the app lives at `/var/www/acceleron-plus` and runs
as a normal user (`deploy` here) — not root.

---

## 1. Prepare the server (once)

```bash
sudo apt update && sudo apt install -y git curl nginx build-essential
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# The sweep cron uses the server clock
sudo timedatectl set-timezone Asia/Kolkata

# Firewall: SSH + web only. Port 3000 is bound to 127.0.0.1 and stays closed.
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

sudo mkdir -p /var/www/acceleron-plus && sudo chown $USER:$USER /var/www/acceleron-plus
```

**PostgreSQL on the same box?** `sudo apt install -y postgresql`, then create
the four databases and a dedicated login (don't use the `postgres` superuser
password from your laptop — that one is in git history):

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE acceleron LOGIN PASSWORD 'change-me';
CREATE DATABASE identity_db  OWNER acceleron;
CREATE DATABASE project_db   OWNER acceleron;
CREATE DATABASE itsm_db      OWNER acceleron;
CREATE DATABASE execution_db OWNER acceleron;
SQL
```

## 2. Get the code onto the server

**With git (recommended).** Push the project to a private repo, then:

```bash
git clone <your-repo-url> /var/www/acceleron-plus
```

**Without git.** From the Windows laptop (PowerShell, inside the project
folder), pack everything except the heavy/secret folders and copy it up:

```powershell
tar --exclude=node_modules --exclude=.next --exclude=uploads --exclude=logs `
    --exclude=.env.local -czf ..\acceleron-plus.tgz .
scp ..\acceleron-plus.tgz deploy@your-server:/tmp/
```
```bash
tar -xzf /tmp/acceleron-plus.tgz -C /var/www/acceleron-plus
```
Later deploys: same two commands, then `./scripts/deploy.sh --no-pull`.

## 3. Create the production `.env.local`

Start from `.env.example` — **not** from the laptop's `.env.local`. Next.js and
the migration scripts both read this file.

```bash
cd /var/www/acceleron-plus
cp .env.example .env.local && chmod 600 .env.local
nano .env.local
```

Must be set:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | a **new** one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — the server refuses to start without ≥ 32 chars |
| `DATABASE_HOST/PORT/USER/PASSWORD` | the production Postgres login |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | **required** — in production sign-in codes are only ever emailed; with no SMTP nobody can sign in |
| `NEXT_PUBLIC_APP_URL` | `https://plus.yourdomain.com` — baked in at build time, so set it before building |
| `NOTIFICATION_SWEEP_TOKEN` | a random string (same command as the secret); the sweep job uses it |
| `DARWINBOX_MASTER_API_URL`, `DARWINBOX_API_KEY`, `DARWINBOX_DATASET_KEY`, `DARWINBOX_API_USERNAME`, `DARWINBOX_API_PASSWORD`, `DARWINBOX_COMPANY_CODES=ASPL` | use exactly these names — the code does not read `DARWINBOX_BASIC_AUTH_*`, `DARWINBOX_BASE_URL`, `DARWINBOX_ENDPOINT` or `DARWINBOX_COMPANY_CODE` |

Leave `NODE_ENV` out of the file — pm2 sets it. `AUTH_OTP_DELIVERY=screen`
has no effect in production.

## 4. First deploy

```bash
cd /var/www/acceleron-plus
chmod +x scripts/deploy.sh
./scripts/deploy.sh --migrate
```

The script runs `npm ci`, every migration in order, `next build`, starts
both pm2 apps, saves the process list and checks that `/login` answers.

Then load people and make yourself admin:

```bash
node src/lib/seeds/sync-darwinbox.js --dry-run     # look first
node src/lib/seeds/sync-darwinbox.js
node src/lib/seeds/grant-role.js --email you@acceleronsolutions.io --role admin
```

## 5. Start on boot + log rotation

```bash
pm2 startup systemd      # prints a sudo command — copy and run it
pm2 save

pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

## 6. nginx + HTTPS

Point the domain's DNS A record at the server first.

```bash
sudo cp deploy/nginx/acceleron-plus.conf /etc/nginx/sites-available/acceleron-plus
sudo sed -i 's/plus.example.com/plus.yourdomain.com/' /etc/nginx/sites-available/acceleron-plus
sudo ln -s /etc/nginx/sites-available/acceleron-plus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d plus.yourdomain.com --redirect
```

certbot renews itself (systemd timer). Open `https://plus.yourdomain.com`.

---

## Everyday commands

| Task | Command |
|---|---|
| Deploy new code | `./scripts/deploy.sh` (add `--migrate` when a release adds a migration) |
| Status | `pm2 status` |
| Live logs | `pm2 logs acceleron-plus` |
| Restart | `pm2 reload acceleron-plus --update-env` (after editing `.env.local`) |
| Run the sweep now | `pm2 restart acceleron-sweep` then `pm2 logs acceleron-sweep --lines 5` |
| Resource view | `pm2 monit` |

`NEXT_PUBLIC_*` values need a rebuild, not just a restart — rerun `deploy.sh`.

## Backups

Two things hold data: Postgres and `uploads/` (project documents are stored
on disk, not in the database). Back up both, e.g. nightly:

```bash
for db in identity_db project_db itsm_db execution_db; do
  pg_dump -Fc -h 127.0.0.1 -U acceleron "$db" > "/var/backups/acceleron/$db-$(date +%F).dump"
done
tar -czf "/var/backups/acceleron/uploads-$(date +%F).tgz" -C /var/www/acceleron-plus uploads
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| pm2 shows `errored`, log says `SESSION_SECRET is missing` / `DATABASE_PASSWORD is not set` | `.env.local` missing or not in `/var/www/acceleron-plus` |
| Sign-in says a code was sent, nothing arrives | SMTP settings wrong — check `pm2 logs acceleron-plus` for the nodemailer error |
| Signing in loops back to `/login` | browsing over plain `http://` — the session cookie is `Secure` in production; use the HTTPS URL |
| `413 Request Entity Too Large` on upload | nginx `client_max_body_size` (set to 55m in the provided site) |
| `acceleron-sweep` logs `token rejected` | `NOTIFICATION_SWEEP_TOKEN` empty or changed without `pm2 reload acceleron-plus --update-env` |
| Build fails with `Cannot find module 'typescript'` / tailwind | devDependencies skipped — the script uses `npm ci --include=dev`; don't replace it with `npm ci --production` |

## More than one instance

One instance comfortably serves an internal team. Before raising
`instances` in `ecosystem.config.js`:

- each instance opens pools to all four databases: `instances × 4 ×
  DATABASE_POOL_MAX` must stay under Postgres `max_connections` (100 by
  default) — lower `DATABASE_POOL_MAX` to 5;
- switch `exec_mode` to `"cluster"` so `pm2 reload` restarts them one at a
  time with no downtime;
- read the "Multi-Instance" section of
  `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` (shared
  cache, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`).
