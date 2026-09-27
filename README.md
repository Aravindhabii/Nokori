# Expense Tracker

A lightweight, self-hosted expense & income tracker built for **effortless daily entry**:

- **iPhone Back Tap → Shortcut → instant save** — log spending on the go without opening any app.
- **Installable PWA** (iPhone + Mac) for the dashboard, reports, and manual entry — no App Store, no Apple Developer account.
- **Multi-user** with private per-user data, self-hosted on your own server via Docker.

## Architecture

```
 iPhone Back Tap ──▶ iOS Shortcut ──POST /api/entries──┐
                                                        ▼
 PWA (iPhone + Mac) ◀──REST──▶  Node/Fastify API  ──▶  SQLite (one file, Docker volume)
                                (serves the PWA too)
```

One container = Fastify API + the built PWA + a single SQLite file.

## Tech

- **Backend:** Node 20, Fastify, better-sqlite3, argon2, zod.
- **Frontend:** Vite + Preact + TypeScript, Chart.js, vite-plugin-pwa.
- **Auth:** username/password login; opaque, revocable tokens. The iOS Shortcut uses a per-user **personal API token** generated in the app.

## Quick start (Docker)

```bash
cp .env.example .env

# set SIGNUP_CODE to any shared code, and generate a strong DB_KEY:
openssl rand -base64 48        # copy the output into DB_KEY in .env
# (no openssl? use: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")

docker compose up -d --build
```

On first boot with an empty volume, the app creates a **fresh database that's encrypted from the start** — no migration needed (rekey-migration only runs if you already had a plaintext DB). Then open `http://<server>:3000` → **Sign up** using your `SIGNUP_CODE` → log in.

> ⚠️ Save your `DB_KEY` somewhere safe and separate. If it's lost, the data is **permanently unrecoverable**, and you must never change it once data exists.

### Environment variables

| Var           | Required | Default                 | Notes                                             |
|---------------|----------|-------------------------|---------------------------------------------------|
| `SIGNUP_CODE` | ✅       | —                       | Shared code required to create an account.         |
| `DB_KEY`      | ✅       | —                       | Encrypts the DB at rest (SQLCipher). **Back it up; losing it = unrecoverable data.** |
| `PORT`        |          | `3000`                  | Host port (container always listens on 3000).      |
| `DB_PATH`     |          | `/app/data/expenses.db` | SQLite file path (kept on the `expense-data` volume). |

### Security

- **At rest:** the SQLite file is encrypted with `DB_KEY` (SQLCipher). On first boot with a key set, an existing plaintext DB is transparently rekeyed to encrypted. The file is useless if copied off the server without the key.
- ⚠️ **Key safety:** store `DB_KEY` somewhere safe and separate from the volume. If you lose it the data is **permanently unrecoverable**, and you must never change it once data exists.
- **In transit:** HTTPS/HSTS (behind your proxy) + security headers/CSP via helmet; login is rate-limited.
- **2FA:** each user can optionally enable TOTP two-factor auth (Settings → Two-factor).
- **Tokens:** passwords hashed with argon2; session/API tokens stored as hashes.

## Deploy behind HTTPS (required for iOS)

iOS needs HTTPS for both the installable PWA and the Shortcut's network request. Point your existing reverse proxy at the container. Example (Caddy):

```
expenses.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Nginx: `proxy_pass http://localhost:3000;` inside a TLS `server {}` block. The app sets `trustProxy`, so client IPs (for rate limiting) come through correctly.

Then open `https://expenses.yourdomain.com` and follow **[SETUP-IOS.md](./SETUP-IOS.md)** for the Back Tap quick-entry Shortcut and the daily reminder.

## Backups

All financial history lives in one SQLite file on the `expense-data` volume. Since it's **encrypted at rest**, you can copy the file directly — it stays encrypted (useless without `DB_KEY`). Stop the container first for a consistent copy:

```bash
docker compose stop
docker run --rm -v expencetracker_expense-data:/data -v "$PWD":/out alpine \
  cp /data/expenses.db /out/expenses-backup-$(date +%F).db
docker compose start
```

To restore, put the file back and boot with the **same `DB_KEY`**. Keep a copy of `DB_KEY` with (but ideally stored separately from) your backups — the backup is unrecoverable without it. The compose project prefix is `expencetracker` (from the folder name), so the volume is `expencetracker_expense-data`.

## Local development

```bash
# terminal 1 — API
cd server && npm install && SIGNUP_CODE=dev npm run dev

# terminal 2 — PWA (proxies /api to localhost:3000)
cd web && npm install && npm run dev
```

Open the Vite URL (default `http://localhost:5173`).

## API summary

All `/api` routes except signup/login require `Authorization: Bearer <token>`.

| Method | Path                 | Purpose                            |
|--------|----------------------|------------------------------------|
| POST   | `/api/auth/signup`   | Create account (needs signup code) |
| POST   | `/api/auth/login`    | Log in → session token             |
| POST   | `/api/auth/logout`   | Revoke current token               |
| GET    | `/api/entries`       | List (filters: from,to,type,category) |
| POST   | `/api/entries`       | Create entry (used by the Shortcut) |
| PATCH  | `/api/entries/:id`   | Edit entry                         |
| DELETE | `/api/entries/:id`   | Delete entry                       |
| GET    | `/api/summary`       | Totals + by-category + by-month    |
| GET    | `/api/tokens`        | List personal API tokens          |
| POST   | `/api/tokens`        | Create API token (shown once)      |
| DELETE | `/api/tokens/:id`    | Revoke API token                   |

Amounts are in **₹ INR**; dates are handled in **IST (Asia/Kolkata)**.
