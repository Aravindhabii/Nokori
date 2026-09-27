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
# edit .env: set SIGNUP_CODE to a long random string
docker compose up -d --build
```

Open `http://<server>:3000` → **Sign up** using your `SIGNUP_CODE` → log in.

### Environment variables

| Var           | Required | Default                 | Notes                                             |
|---------------|----------|-------------------------|---------------------------------------------------|
| `SIGNUP_CODE` | ✅       | —                       | Shared code required to create an account.         |
| `PORT`        |          | `3000`                  | Host port (container always listens on 3000).      |
| `DB_PATH`     |          | `/app/data/expenses.db` | SQLite file path (kept on the `expense-data` volume). |

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

All financial history lives in one SQLite file on the `expense-data` volume. Back it up regularly, e.g. a daily cron:

```bash
docker exec expense-tracker \
  node -e "require('better-sqlite3')(process.env.DB_PATH).backup('/app/data/backup-'+new Date().toISOString().slice(0,10)+'.db')"
```

…or simply copy the volume file while the container is stopped:

```bash
docker run --rm -v expense-tracker_expense-data:/data -v "$PWD":/out alpine \
  cp /data/expenses.db /out/expenses-backup.db
```

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
