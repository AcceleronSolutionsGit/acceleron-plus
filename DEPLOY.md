# Deploying Acceleron Plus with pm2 (Ubuntu)

The app runs as one `next start` process under pm2, listening on
`127.0.0.1:3000`. Apache sits in front as a reverse proxy and terminates
HTTPS. A second pm2 entry fires the daily overdue-milestone sweep.

```
browser ──https──▶ Apache :443 ──▶ 127.0.0.1:3000  pm2: acceleron-plus
                                                  pm2: acceleron-sweep (08:00 daily)
                                   PostgreSQL: identity_db, project_db, itsm_db, execution_db
```

| File | Purpose |
|---|---|
| `ecosystem.config.js` | pm2 process definitions (app + sweep) |
| `scripts/deploy.sh` | install → migrate (optional) → build → pm2 reload → health check |
| `scripts/notification-sweep.js` | calls `POST /api/notifications/sweep` with the sweep token |
| `scripts/db-export.ps1` | (Windows) dumps the four databases + uploaded documents from the laptop |
| `scripts/db-import.sh` | (server) loads those dumps into the server's PostgreSQL |
| `deploy/apache/acceleron-plus.conf` | Apache reverse-proxy site (50 MB uploads, forwarded headers) |
| `deploy/nginx/acceleron-plus.conf` | the same site for nginx, if a server ever uses that instead |

Commands below assume the app lives at `/var/www/acceleron-plus` and runs
as a normal user (`deploy` here) — not root.

---

## 1. Prepare the server (once)

```bash
sudo apt update && sudo apt install -y git curl apache2 build-essential
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# The sweep cron uses the server clock
sudo timedatectl set-timezone Asia/Kolkata

# Firewall: SSH + web only. Port 3000 is bound to 127.0.0.1 and stays closed.
sudo ufw allow OpenSSH && sudo ufw allow 'Apache Full' && sudo ufw enable

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

## 3½. Moving the data from the laptop (optional)

Skip this for a clean start. To carry over what is already in the laptop's
PostgreSQL — projects, teams, timesheets, users, and the uploaded
documents — dump it on Windows and load it on the server. Two scripts do
it; both read the connection settings from their own `.env.local`.

**On the Windows laptop** (PowerShell, in the project folder):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-export.ps1
scp -r ..\acceleron-db deploy@your-server:/tmp/
```

`db-export.ps1` finds `pg_dump` (on PATH or under `C:\Program Files\PostgreSQL`),
writes `identity_db.dump`, `project_db.dump`, `itsm_db.dump`,
`execution_db.dump` and `uploads.tgz` to `..\acceleron-db`, and prints the
`pg_dump` version it used. The dumps are taken without owners or grants, so
the laptop's `postgres` user does not come across.

**On the server** — after step 1 (the four databases exist, owned by the
`acceleron` login) and step 3 (`.env.local` points at them):

```bash
sudo apt install -y postgresql-client        # if psql / pg_restore are missing
cd /var/www/acceleron-plus
chmod +x scripts/db-import.sh
./scripts/db-import.sh /tmp/acceleron-db
```

It checks everything before touching anything, restores each database in a
single transaction as the app login (so every table ends up owned by it),
runs `ANALYZE`, and unpacks the documents into `uploads/`. Then step 4
(`deploy.sh --migrate`) brings the schema up to the current build — the
migrations are idempotent, and they include the Developer / Team Lead / PM
role conversion. Run `node src/lib/migrations/migrate-team-roles.js --dry-run`
first if you want to see those changes before they happen.

| It stops with | Do this |
|---|---|
| `dumped with pg_dump 17 but this server has pg_restore 16` | The server's PostgreSQL must be the same major version as the laptop's or newer. Install the newer one from apt.postgresql.org (`sudo apt install -y postgresql-17`) and create the databases there. |
| `Cannot connect to project_db as acceleron` | Step 1 not done, or `.env.local` has a different user/password. |
| `project_db already has N tables` | Something is already there — `--replace` wipes the app's tables and reloads. |
| `uses the citext extension` | Extensions need a superuser; run the `CREATE EXTENSION` line it prints, then re-run. |

To refresh the server from the laptop again later, repeat both commands and
add `--replace` on the server. That overwrites whatever was entered on the
server since, so do it only before people start using it.

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

## 6. Apache + HTTPS

Point the domain's DNS A record at the server first.

```bash
# Modules the site needs (proxy_wstunnel is not — production Next.js has no websockets)
sudo a2enmod proxy proxy_http headers rewrite ssl

sudo cp deploy/apache/acceleron-plus.conf /etc/apache2/sites-available/acceleron-plus.conf
sudo sed -i 's/plus.example.com/plus.yourdomain.com/' /etc/apache2/sites-available/acceleron-plus.conf
sudo a2ensite acceleron-plus
sudo apache2ctl configtest && sudo systemctl reload apache2

sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d plus.yourdomain.com --redirect
```

certbot writes `acceleron-plus-le-ssl.conf` (a copy of the site on :443 with
the certificate) and turns the :80 site into a redirect. It renews itself
(systemd timer). Open `https://plus.yourdomain.com`.

**Apache already hosts other sites?** Leave them alone — this is a separate
`VirtualHost` matched by `ServerName`, so only disable `000-default`
(`sudo a2dissite 000-default`) if nothing else relies on it. It needs its own
domain or subdomain; serving it under a sub-path such as
`example.com/acceleron` would also need `basePath` in `next.config.ts` and a
rebuild.

**Why the site unsets `X-Forwarded-For`.** Unlike nginx's
`proxy_set_header`, Apache's `mod_proxy` *appends* the client address to any
`X-Forwarded-For` the browser sent. The app takes the first entry for its
sign-in audit log and rate limit, so without `RequestHeader unset
X-Forwarded-For early` a client could put any address it liked there. If a
load balancer or Cloudflare ever sits in front of Apache, revisit this (use
`mod_remoteip` with that proxy's addresses as trusted).

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
| `413 Request Entity Too Large` on upload | the file is over 55 MB — the `RewriteCond … Content-Length` rule in the site (Apache's `LimitRequestBody` does not apply to proxied requests, so the site uses a rewrite rule instead) |
| `503 Service Unavailable` from Apache | the app isn't running on :3000 — `pm2 status`, then `pm2 logs acceleron-plus` |
| `Invalid command 'RequestHeader'` / `ProxyPass` on `configtest` | a module isn't enabled — `sudo a2enmod proxy proxy_http headers` |
| Exports cut off with `502`/`504` after ~60 s | `ProxyTimeout` missing from the site (the provided one sets 120) |
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
