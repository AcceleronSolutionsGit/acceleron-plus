# Authentication — Acceleron Plus

Sign-in is a one-time code emailed to the user. Accounts live in
`identity_db.users`, passwords (when enabled) are hashed with scrypt, and the
session cookie is HMAC-signed so its contents cannot be edited by the user.

---

## Setup (once)

### 0. Delete the old middleware file

```
src/middleware.ts        ← delete this
src/proxy.ts             ← its replacement, already in place
```

Next.js 16 renamed the `middleware` file convention to `proxy` and **fails the
build if both files exist**:

> Both middleware file "./src/middleware.ts" and proxy file "./src/proxy.ts" are
> detected. Please use "./src/proxy.ts" only.

### 1. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in at least these two:

```bash
SESSION_SECRET=<48+ random chars>
DATABASE_PASSWORD=<your postgres password>
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`SESSION_SECRET` signs every session cookie. Without it the app refuses to start
in production; changing it later signs everyone out. Never commit `.env.local`.

### 2. Migrate

```bash
node src/lib/migrations/migrate-auth.js
```

Idempotent — safe to re-run. It adds to `identity_db`:

| Object | Purpose |
|---|---|
| `users.password_hash` | scrypt hash |
| `users.password_updated_at` | last change |
| `users.must_change_password` | forces a reset at next sign-in |
| `users.last_login_at` | audit |
| `users.failed_login_count`, `users.locked_until` | brute-force lockout |
| `users.sessions_valid_from` | watermark for global sign-out |
| `users_email_lower_unique` | stops two accounts differing only by case |
| `user_sessions` | issued/revoked sessions |
| `login_audit` | every attempt, with IP and reason |
| `roles` seed rows | admin, project_manager, agent, member, client |

If two users share an email (case-insensitively) the unique index is skipped and
the duplicates are printed — fix them and re-run.

### 3. Issue passwords

```bash
node src/lib/seeds/seed-auth-passwords.js --admin you@acceleronsolutions.com
```

Writes a unique strong password per user to `auth-credentials.csv` (git-ignored,
mode 600) and marks every account `must_change_password`. Distribute the file,
then delete it.

| Flag | Effect |
|---|---|
| `--admin <email>` | grant the admin role (repeatable) |
| `--password <value>` | one shared password for everyone — dev only |
| `--only <email>` | target a single account (repeatable) |
| `--force` | re-issue for users who already have a password |
| `--out <file>` | change the CSV path |

### 4. Run

```bash
npm run dev
```

Sign in, and you are sent straight to `/change-password` to replace the issued
password.

---

## Sign-in is now a one-time code

Enter your work email, receive a 6-digit code, enter it. No password.

```bash
node src/lib/migrations/migrate-otp.js
```

**In development** the code is shown on the sign-in screen and printed to the
terminal, so you can get in without a mail server. **In production** it is only
ever emailed — the reveal is gated on `NODE_ENV` and no environment variable can
turn it back on, because a visible code would hand any account to anyone who
knows an email address. A production build with no `SMTP_*` settings therefore
cannot sign anyone in, by design.

### What protects a six-digit code

A million possibilities is not much, so the guarantees come from the constraints:

| | |
|---|---|
| Lifetime | 5 minutes |
| Wrong guesses | 5, then the challenge is burned — the correct code stops working too |
| Reuse | none; consumed atomically, so two racing requests cannot both win |
| Browser binding | the challenge id lives in an httpOnly cookie, never in the page |
| Storage | HMAC-SHA256 keyed with `SESSION_SECRET` — the code itself is never stored |
| Rate limit | 6 codes per account per 15 minutes; 30-second resend cooldown |
| Superseding | requesting a new code immediately invalidates the previous one |

Knowing a code is not enough — it has to be redeemed in the browser that asked
for it.

### Not confirming which emails exist

Because the code alone grants access, "no such user" would be a way to enumerate
every address in the company. Unknown, deactivated and valid accounts all get
the same status, the same response body, and the same `Set-Cookie` header —
unknown addresses receive a decoy challenge id that matches nothing.

One gap worth knowing: a real address triggers an SMTP round trip and an unknown
one does not, so **response time still differs**. Closing that would mean giving
up the "we could not send your code" error, which seemed the worse trade for an
internal tool. If you'd rather have constant time, send the mail without
awaiting it.

### If sign-in returns a 500

The sign-in routes now recognise setup problems and say what to do, rather
than leaving a bare 500 in the terminal:

| What you see | What it means |
|---|---|
| `The "login_otp_challenges" table is missing. Run: node src/lib/migrations/migrate-otp.js` | the OTP migration has not been run |
| `The database is out of date (missing column "…")` | a migration is pending |
| `The database rejected our credentials` | `DATABASE_USER` / `DATABASE_PASSWORD` in `.env.local` |
| `That database does not exist` | the `DATABASE_*_NAME` values |

The message appears on the sign-in screen as well as in the server log.

### Endpoints

| Route | Does |
|---|---|
| `POST /api/auth/request-otp` | `{ email }` → issues a code, sets the challenge cookie |
| `POST /api/auth/verify-otp` | `{ code }` → verifies and issues the session |
| `POST /api/auth/resend-otp` | new code for the challenge in progress |
| `POST /api/auth/login` | the old password route — returns 410 unless re-enabled |

### Turning the password back on

Everything from the password work is intact — scrypt hashing, the change-password
screen, admin resets, lockout.

- `AUTH_REQUIRE_PASSWORD=true` — the code *and* the password are required, and
  the forced password-change screen applies again.
- `AUTH_PASSWORD_LOGIN_ENABLED=true` — re-enables `POST /api/auth/login`.

While passwords are out of the login path, the forced password-change redirect is
skipped. It asks for a current password, so leaving it on would have stranded
every seeded user on a screen they could not clear.


---

## How password sign-in works (when re-enabled)

**Session cookie.** `base64url(payload).base64url(hmac-sha256)`, httpOnly,
`Secure` in production, `SameSite=lax`, 8-hour expiry. `src/lib/session.ts` uses
only Web Crypto so `proxy.ts` can import it. Editing the payload invalidates the
signature, so a member cannot promote themselves to admin.

**Every request** is checked twice: `proxy.ts` verifies the signature at the edge
and rejects unauthenticated API calls with 401 JSON (pages redirect to `/login`);
route handlers then call `getSession()`, which re-reads the user row so that
deactivating someone, or changing their role, takes effect on the next request
rather than in 8 hours. The lookup is wrapped in React `cache`, so it costs one
query per request regardless of how many times it's called.

**Passwords.** scrypt (N=65536, r=8, p=1), 16-byte salt, 64-byte key, compared
with `timingSafeEqual`. About 0.5 s per verification by design. No native
dependency, so nothing to compile on Windows. New passwords need 10+ characters
and three of: lowercase, uppercase, number, symbol.

**Lockout.** 8 consecutive failures locks the account for 15 minutes. Unknown
emails and wrong passwords return the same message and take about the same time,
so neither reveals whether an account exists.

---

## Endpoints

| Route | Who | Does |
|---|---|---|
| `POST /api/auth/login` | anyone | verify credentials, issue session |
| `POST /api/auth/logout` | anyone | revoke session, clear cookie |
| `GET /api/auth/me` | signed in | current session + user |
| `POST /api/auth/change-password` | signed in | change own password |
| `POST /api/auth/reset-password` | admin | issue a temp password for another user |

Changing a password revokes every *other* session for that user; the caller stays
signed in. An admin reset revokes all of the target's sessions.

## Route guards

```ts
const auth = await requireRole(["admin"]);
if (!auth.ok) return auth.response;
// auth.session is trustworthy from here
```

`requireSession()` is the same without the role check. `proxy.ts` additionally
blocks `/admin`, `/api/admin` and `/api/auth/reset-password` for non-admins.
Integration routes guard themselves per handler, because some allow PMs too.

Project routes use capabilities rather than role names, because the answer
depends on the project as well as the person:

```ts
const guard = await requireProjectCapability(id, "plan.create");
if (!guard.ok) return guard.response;
```

One call checks the session, resolves the id-or-code to a project, and checks
the capability against that project. `requireCapabilityGlobally(capability)` is
the same for routes that are not about one project. The matrix behind both
lives in `src/lib/permissions.ts` and is shared with the UI — see
**ACCESS-AND-EXPORTS.md**.

---

## Admin tasks

**Change someone's role** — `/admin/roles` in the app, or
`node src/lib/seeds/grant-role.js --email someone@acceleronsolutions.io --role admin`.
Either way `sessions_valid_from` is stamped, so the change takes effect on
their next request rather than after their session expires. The last active
admin cannot be demoted or deactivated.

**Reset someone's password** — `POST /api/auth/reset-password` with
`{"userId":"..."}`. The temporary password is returned once.

**Deactivate someone** — `UPDATE users SET is_active = false WHERE email = '...'`.
Their next request fails; no logout needed.

**Sign everyone out** — `UPDATE users SET sessions_valid_from = now()`. Or rotate
`SESSION_SECRET`, which invalidates every cookie at once.

**Review sign-ins**

```sql
SELECT created_at, email, success, reason, ip_address
FROM login_audit ORDER BY created_at DESC LIMIT 50;
```

---

## Note on the old credentials

The Postgres password was previously hardcoded in `src/lib/db.ts` and in eight
migration and seed scripts. Those now read `DATABASE_PASSWORD` via
`src/lib/db-config.js`. **If that password was ever committed to git, treat it as
public and rotate it** — removing it from the working tree does not remove it
from history.

---

## Still on mock data

Not part of this change, but worth knowing:

- `src/lib/api.ts` still falls back to `mock-data.ts` for users, requesters,
  companies, departments and service groups.
- `src/lib/row-mapper.ts` resolves display names from `mockUsers`.
- `nodemailer` and `pptxgenjs` are installed but never imported — billing emails
  and deck export are not implemented.
- Zoho CRM has env vars but no integration code.
- `src/app/api/pmt/projects/[id]/billing/route.ts` writes a placeholder UUID
  (`00000000-...`) as `billing_milestone_id`.
