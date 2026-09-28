# Deploying Acceleron Plus with pm2 (Ubuntu)

The app runs as one `next start` process under pm2, listening on
`127.0.0.1:8099` (set in `ecosystem.config.js`; `APP_PORT` overrides). Apache sits in front as a reverse proxy and terminates
HTTPS. A second pm2 entry fires the daily overdue-milestone sweep; a third
knocks every 15 minutes to run the Darwinbox auto-sync when it is due.

```
browser ──https──▶ Apache :443 ──▶ 127.0.0.1:8099  pm2: acceleron-plus
                                                  pm2: acceleron-sweep (08:00 daily)
                                                  pm2: acceleron-darwinbox-sync (every 15 min check)
                                   PostgreSQL: identity_db, project_db, itsm_db, execution_db
```

| File | Purpose |
|---|---|
| `ecosystem.config.js` | pm2 process definitions (app + sweep + Darwinbox auto-sync) |
| `scripts/deploy.sh` | install → migrate (optional) → build → pm2 reload → health check |
| `scripts/notification-sweep.js` | calls `POST /api/notifications/sweep` with the sweep token |
| `scripts/darwinbox-autosync.js` | calls `POST /api/integrations/darwinbox/autosync` with the same token; the app decides whether a sync is due |
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

# Firewall: SSH + web only. Port 8099 is bound to 127.0.0.1 and stays closed.
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
writes `identity_db.sql`, `project_db.sql`, `itsm_db.sql`,
`execution_db.sql` and `uploads.tgz` to `..\acceleron-db`, and prints the
`pg_dump` version it used. The dumps are plain SQL without owners or grants,
so the laptop's `postgres` user does not come across — and, unlike pg_dump's
archive format, they load into an **older** PostgreSQL too (the laptop runs
17, the SUSE server 16). `-Format custom` gives the archive format instead,
which needs a server of the same version or newer.

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
| `…dump comes from a newer PostgreSQL than this server's pg_restore can read` (or `unsupported version (1.16) in file header`) | Those are archive-format `.dump` files from an older export. Export again with the default SQL format and copy the `.sql` files — they load into an older server. |
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

## 6a. On APPLSRV: a folder of apps.acceleronsolutions.io (what production uses)

Every app on APPLSRV is a folder of one site, `apps.acceleronsolutions.io`,
defined in `/etc/apache2/default-server.conf` with its certificate.
Acceleron Plus joins them at **`https://apps.acceleronsolutions.io/acceleron-plus/`**
— no DNS change, no new certificate. (`/acceleron/` is already another app on
port 5081, and `/itsm-backend/` owns port 3000 — hence port 8099.)

The app lives in **`/srv/www/htdocs/acceleron-plus`**, alongside the others.
That folder is inside the site's DocumentRoot, so the Apache block below also
denies it as a file directory: `/acceleron-plus/…` is always proxied to the
app (a request for `/acceleron-plus/.env.local` gets the app's 404, or 503
while it is stopped — never the file).

1. In the server's `.env.local`, **before building**:

   ```
   NEXT_PUBLIC_BASE_PATH=/acceleron-plus
   NEXT_PUBLIC_APP_URL=https://apps.acceleronsolutions.io/acceleron-plus
   ```

   `NEXT_PUBLIC_BASE_PATH` is baked into the build (`next.config.ts` →
   `basePath`), so change it only together with `./scripts/deploy.sh`.
   Plain-string URLs that Next does not rewrite — `fetch("/api/…")`,
   `window.location`, `<a href>`, cookie paths, `next/image` src, CSS fonts —
   go through `src/lib/base-path.ts`; the hundred-odd `fetch` calls are
   prefixed by one small script in `app/layout.tsx`. Cookies are scoped to
   `/acceleron-plus`, so no other app on the domain receives them.

2. Build and start: `./scripts/deploy.sh --no-pull` — the health check hits
   `127.0.0.1:8099/acceleron-plus/login`.

3. Apache — one include file, one line in the existing site:

   ```bash
   cp deploy/apache/acceleron-plus-subpath.conf /etc/apache2/acceleron-plus.inc
   cp /etc/apache2/default-server.conf /etc/apache2/default-server.conf.bak
   grep -q "acceleron-plus.inc" /etc/apache2/default-server.conf || \
     sed -i '0,/^\([[:space:]]*\)ProxyPreserveHost On/s//&\n\1Include \/etc\/apache2\/acceleron-plus.inc/' /etc/apache2/default-server.conf
   apachectl configtest && systemctl reload apache2
   ```

   The include proxies `/acceleron-plus/` to `127.0.0.1:8099/acceleron-plus/`
   (the folder name is kept — Next expects it), drops a browser-sent
   `X-Forwarded-For`, sets `X-Forwarded-Proto: https`, refuses uploads over
   55 MB, and caches `/_next/static/`. Everything in it is scoped to
   `/acceleron-plus`, so the other apps are untouched. `reload` (graceful)
   rather than `restart`, so their open connections are not cut.

Verified against a production build behind Apache 2.4.58 with this include in
a copy of that site: `/acceleron-plus` and `/acceleron-plus/` both reach the app (a 301 to the trailing slash would loop — Next redirects it back); a
signed-out `/acceleron-plus/pmt` → `/acceleron-plus/login?from=%2Fpmt`; every
script, stylesheet, font, logo and favicon under `/acceleron-plus/…` answers
200; in Chromium the sign-in form posted to `/acceleron-plus/api/auth/request-otp`;
the session cookie is set with `Path=/acceleron-plus`; a forged
`X-Forwarded-For` reached the app as the real address; 60 MB was refused;
`/acceleron/` still went to its own backend.

## 6. Apache + HTTPS (a site of its own — not used on APPLSRV)

Point the domain's DNS A record at the server first. The site file
`deploy/apache/acceleron-plus.conf` holds both halves: `:80` redirects to
`https://`, `:443` proxies to the app on `127.0.0.1:8099`. Replace
`plus.example.com` (3 places) and point the two `SSLCertificate` lines at
your certificate.

**SUSE (SLES 15)**

```bash
a2enmod proxy; a2enmod proxy_http; a2enmod headers; a2enmod rewrite; a2enmod ssl
a2enflag SSL                                   # makes Apache listen on 443
cp deploy/apache/acceleron-plus.conf /etc/apache2/vhosts.d/acceleron-plus.conf
sed -i 's/plus.example.com/plus.yourdomain.com/g' /etc/apache2/vhosts.d/acceleron-plus.conf
# company certificate?  edit the two SSLCertificate lines to its .crt/.key
apachectl configtest && systemctl restart apache2
firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
```

`configtest` fails while the certificate files it names do not exist. For a
Let's Encrypt certificate, comment out the :443 block, reload, get the
certificate with `certbot certonly --webroot -w /srv/www/htdocs -d
plus.yourdomain.com` (the :80 site leaves `/.well-known/acme-challenge/`
alone for exactly this), then put the block back and restart.

**Ubuntu**

```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo cp deploy/apache/acceleron-plus.conf /etc/apache2/sites-available/acceleron-plus.conf
sudo sed -i 's/plus.example.com/plus.yourdomain.com/g' /etc/apache2/sites-available/acceleron-plus.conf
sudo a2ensite acceleron-plus
sudo apache2ctl configtest && sudo systemctl reload apache2
```

**Changing the app's port** means three places agree: `PORT` in
`ecosystem.config.js`, the two `ProxyPass` lines in the site, and nothing
else — `deploy.sh` and the sweep job read it from there (`APP_PORT` overrides
all of them). `deploy.sh` notices a changed port and recreates the pm2
processes, because `pm2 reload` keeps the old arguments.

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
| Darwinbox auto-sync | Master Data → **Auto-sync** button (on/off, how often, the hour in India time, recent runs). Default: every 24 h at 02:00 IST. `pm2 logs acceleron-darwinbox-sync --lines 20` shows each check |
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
| A 404 right after signing in | The bare `/acceleron-plus` line in Apache must be `ProxyPassMatch "^(/acceleron-plus)$" "http://127.0.0.1:8099$1"` — without the `$1` capture, ProxyPassMatch appends the path and the app receives `/acceleron-plus/acceleron-plus`. |
| "We could not send your sign-in code" / `535 5.7.3 Authentication unsuccessful` | Run `node scripts/test-smtp.js you@acceleronsolutions.io` — it reads `.env.local` exactly as the app does. A value containing `#` must be in double quotes (`SMTP_PASS="abc#12"`): unquoted, everything from `#` on is a comment, so the app sends a shortened password. The script warns about this and prints the length the app sees. |
| Sign-in says a code was sent, nothing arrives | SMTP settings wrong — check `pm2 logs acceleron-plus` for the nodemailer error |
| Signing in loops back to `/login` | browsing over plain `http://` — the session cookie is `Secure` in production; use the HTTPS URL |
| `413 Request Entity Too Large` on upload | the file is over 55 MB — the `RewriteCond … Content-Length` rule in the site (Apache's `LimitRequestBody` does not apply to proxied requests, so the site uses a rewrite rule instead) |
| `503 Service Unavailable` from Apache | the app isn't running on :8099 — `pm2 status`, then `pm2 logs acceleron-plus` |
| `Invalid command 'RequestHeader'` / `ProxyPass` on `configtest` | a module isn't enabled — `sudo a2enmod proxy proxy_http headers` |
| Exports cut off with `502`/`504` after ~60 s | `ProxyTimeout` missing from the site (the provided one sets 120) |
| `acceleron-sweep` logs `token rejected` | `NOTIFICATION_SWEEP_TOKEN` empty or changed without `pm2 reload acceleron-plus --update-env` |
| Auto-sync runs show `401 Unauthorized` or "not configured" | the Darwinbox variables in `.env.local` must use the exact names in section 3; then `pm2 reload acceleron-plus --update-env` |
| `acceleron-darwinbox-sync` logs `token rejected` | same cause as the sweep row above — it uses `NOTIFICATION_SWEEP_TOKEN` too |
| "A Darwinbox sync is already running" | one sync at a time; a lock older than 30 minutes (crashed run) is taken over automatically |
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
