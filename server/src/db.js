import Database from 'better-sqlite3-multiple-ciphers';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { nowISO } from './time.js';

const DB_PATH = process.env.DB_PATH || './data/expenses.db';
const DB_KEY = process.env.DB_KEY; // when set, the DB file is encrypted at rest (SQLCipher)

const dir = dirname(DB_PATH);
if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });

const applyKey = (d) => d.pragma(`key='${DB_KEY.replace(/'/g, "''")}'`);

/**
 * Open the DB, encrypting at rest when DB_KEY is set. If an existing file is still
 * plaintext, transparently migrate it to an encrypted copy on first boot.
 * WARNING: losing DB_KEY makes the data unrecoverable.
 */
function initDb() {
  if (!DB_KEY) return new Database(DB_PATH);

  const hasData = existsSync(DB_PATH) && statSync(DB_PATH).size > 0;
  let plaintextWithData = false;
  if (hasData) {
    try {
      const t = new Database(DB_PATH); // open WITHOUT key
      plaintextWithData = t.prepare('SELECT count(*) c FROM sqlite_master').get().c > 0;
      t.close();
    } catch {
      plaintextWithData = false; // already encrypted → reading without key throws
    }
  }

  if (plaintextWithData) {
    // Encrypt the existing file in place. Rekey isn't allowed in WAL mode, so switch
    // to a rollback journal first; WAL is re-enabled on the keyed open below.
    const plain = new Database(DB_PATH);
    plain.pragma('journal_mode = DELETE');
    plain.pragma(`rekey='${DB_KEY.replace(/'/g, "''")}'`);
    plain.close();
  }

  const d = new Database(DB_PATH);
  applyKey(d); // new empty file becomes encrypted on first write; existing encrypted file opens
  return d;
}

export const db = initDb();
db.pragma('journal_mode = WAL');

// ---- helpers ----
const tableExists = (name) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
const columnExists = (table, col) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

// ---- base tables (v1, unchanged) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    kind         TEXT NOT NULL CHECK (kind IN ('session','api')),
    label        TEXT,
    created_at   TEXT NOT NULL,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
`);

// Optional TOTP 2FA columns on users (added in-place; nullable / default off).
if (!columnExists('users', 'totp_secret')) db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
if (!columnExists('users', 'totp_enabled')) db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`);

// ---- v2 tables (created before entries because entries FKs reference them) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    type                  TEXT NOT NULL CHECK (type IN ('bank','cash')),
    opening_balance_paise INTEGER NOT NULL DEFAULT 0,
    is_default            INTEGER NOT NULL DEFAULT 0,
    archived              INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

  CREATE TABLE IF NOT EXISTS credit_cards (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    credit_limit_paise INTEGER NOT NULL,
    statement_day      INTEGER NOT NULL CHECK (statement_day BETWEEN 1 AND 28),
    due_day            INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 28),
    archived           INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cards_user ON credit_cards(user_id);

  -- purchase_entry_id has no FK on purpose: entries.emi_plan_id already references
  -- emi_plans, and a reciprocal FK would create a circular dependency.
  CREATE TABLE IF NOT EXISTS emi_plans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id           INTEGER NOT NULL REFERENCES credit_cards(id),
    purchase_entry_id INTEGER,
    principal_paise   INTEGER NOT NULL,
    months            INTEGER NOT NULL CHECK (months > 0),
    monthly_paise     INTEGER NOT NULL,
    start_month       TEXT NOT NULL,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_emis_user ON emi_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_emis_card ON emi_plans(card_id);

  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    monthly_income_paise INTEGER NOT NULL DEFAULT 0,
    custom_targets_json  TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS category_meta (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    bucket   TEXT NOT NULL CHECK (bucket IN ('need','wants','savings')),
    PRIMARY KEY (user_id, category)
  );
`);

// entries (v2 shape). Used verbatim for fresh installs and as entries_new during migration.
const entriesSchema = (name) => `
  CREATE TABLE ${name} (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
    amount_paise    INTEGER NOT NULL CHECK (amount_paise > 0),
    category        TEXT,
    note            TEXT,
    occurred_at     TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    account_id      INTEGER REFERENCES accounts(id),
    card_id         INTEGER REFERENCES credit_cards(id),
    from_account_id INTEGER REFERENCES accounts(id),
    to_account_id   INTEGER REFERENCES accounts(id),
    to_card_id      INTEGER REFERENCES credit_cards(id),
    emi_plan_id     INTEGER REFERENCES emi_plans(id),
    CHECK (
      (type='income'   AND account_id IS NOT NULL AND card_id IS NULL AND from_account_id IS NULL AND to_account_id IS NULL AND to_card_id IS NULL AND category IS NOT NULL)
   OR (type='expense'  AND from_account_id IS NULL AND to_account_id IS NULL AND to_card_id IS NULL AND category IS NOT NULL AND ((account_id IS NOT NULL AND card_id IS NULL) OR (account_id IS NULL AND card_id IS NOT NULL)))
   OR (type='transfer' AND account_id IS NULL AND card_id IS NULL AND category IS NULL AND from_account_id IS NOT NULL AND ((to_account_id IS NOT NULL AND to_card_id IS NULL) OR (to_account_id IS NULL AND to_card_id IS NOT NULL)))
    )
  );`;

const entriesIndexes = (name) => `
  CREATE INDEX IF NOT EXISTS idx_${name}_user_date ON ${name}(user_id, occurred_at);
  CREATE INDEX IF NOT EXISTS idx_${name}_account ON ${name}(account_id);
  CREATE INDEX IF NOT EXISTS idx_${name}_card ON ${name}(card_id);
`;

/** Ensure every existing user has exactly one default asset account (a "Cash" wallet). */
function ensureDefaultAccounts() {
  const now = nowISO();
  db.prepare(
    `INSERT INTO accounts (user_id, name, type, opening_balance_paise, is_default, archived, created_at)
     SELECT u.id, 'Cash', 'cash', 0, 1, 0, ?
     FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id)`
  ).run(now);
}

// ---- entries migration / creation ----
const version = db.pragma('user_version', { simple: true });

if (!tableExists('entries')) {
  // Fresh install: create v2 entries directly.
  db.exec(entriesSchema('entries'));
  db.exec(entriesIndexes('entries'));
  db.pragma('user_version = 1');
} else if (!columnExists('entries', 'account_id')) {
  // Existing v1 DB: rebuild entries into the v2 shape and backfill a default account.
  db.pragma('foreign_keys = OFF');
  const migrate = db.transaction(() => {
    ensureDefaultAccounts();
    db.exec(entriesSchema('entries_new'));
    db.exec(`
      INSERT INTO entries_new
        (id, user_id, type, amount_paise, category, note, occurred_at, created_at, account_id)
      SELECT e.id, e.user_id, e.type, e.amount_paise, e.category, e.note, e.occurred_at, e.created_at,
             (SELECT a.id FROM accounts a WHERE a.user_id = e.user_id AND a.is_default = 1)
      FROM entries e;
    `);
    db.exec(`DROP TABLE entries;`);
    db.exec(`ALTER TABLE entries_new RENAME TO entries;`);
    db.exec(entriesIndexes('entries'));
  });
  migrate();
  db.pragma('foreign_keys = ON');
  db.pragma('user_version = 1');
} else if (version < 1) {
  db.pragma('user_version = 1');
}

db.pragma('foreign_keys = ON');
