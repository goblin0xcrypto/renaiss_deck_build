import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "data.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_stats (
      card_id TEXT PRIMARY KEY,
      searches INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      favorites INTEGER NOT NULL DEFAULT 0,
      owners INTEGER NOT NULL DEFAULT 0,
      watch_up INTEGER NOT NULL DEFAULT 0,
      watch_down INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS favorites (
      card_id TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection (
      card_id TEXT PRIMARY KEY,
      qty INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      PRIMARY KEY (deck_id, card_id)
    );
    CREATE TABLE IF NOT EXISTS search_log (
      term TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS op_cards (
      id TEXT PRIMARY KEY,        -- printing id (card_image_id), e.g. OP16-056_p1
      code TEXT NOT NULL,         -- card code (card_set_id), e.g. OP16-056
      name TEXT NOT NULL,
      set_id TEXT,
      set_name TEXT,
      rarity TEXT,
      category TEXT,              -- Leader / Character / Event / Stage
      color TEXT,
      cost TEXT,
      power TEXT,
      counter INTEGER,
      attribute TEXT,
      sub_types TEXT,
      life TEXT,
      text TEXT,
      image TEXT,
      price_usd REAL,
      price_low REAL,
      date_scraped TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_op_cards_code ON op_cards (code);
    CREATE INDEX IF NOT EXISTS idx_op_cards_name ON op_cards (name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_op_cards_set ON op_cards (set_id);
    CREATE TABLE IF NOT EXISTS renaiss_prices (
      card_id TEXT PRIMARY KEY, -- op_cards printing id
      code TEXT NOT NULL,       -- card code, uppercase (OP16-056)
      price_usd REAL NOT NULL,
      grade_label TEXT,         -- Renaiss condition tier, e.g. "Raw A"
      confidence TEXT,
      href TEXT,
      last_sale_at TEXT,
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_renaiss_prices_code ON renaiss_prices (code);
    CREATE TABLE IF NOT EXISTS renaiss_graded (
      card_id TEXT PRIMARY KEY, -- display-only: best graded/other tier when no raw match
      code TEXT NOT NULL,
      price_usd REAL NOT NULL,
      grade_label TEXT,
      confidence TEXT,
      href TEXT,
      last_sale_at TEXT,
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_renaiss_graded_code ON renaiss_graded (code);
    CREATE TABLE IF NOT EXISTS renaiss_fetches (
      code TEXT PRIMARY KEY,    -- negative cache: codes checked against Renaiss
      fetched_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function kvGet<T>(key: string, maxAgeMs: number): { value: T; stale: boolean } | null {
  const row = getDb()
    .prepare("SELECT value, cached_at FROM kv_cache WHERE key = ?")
    .get(key) as { value: string; cached_at: number } | undefined;
  if (!row) return null;
  return { value: JSON.parse(row.value) as T, stale: Date.now() - row.cached_at > maxAgeMs };
}

export function kvSet(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO kv_cache (key, value, cached_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, cached_at = excluded.cached_at`
    )
    .run(key, JSON.stringify(value), Date.now());
}

export function ensureStats(cardId: string) {
  getDb()
    .prepare("INSERT OR IGNORE INTO card_stats (card_id) VALUES (?)")
    .run(cardId);
}

export function bumpStat(
  cardId: string,
  field: "searches" | "views" | "favorites" | "owners" | "watch_up" | "watch_down",
  delta = 1
) {
  ensureStats(cardId);
  getDb()
    .prepare(`UPDATE card_stats SET ${field} = MAX(0, ${field} + ?) WHERE card_id = ?`)
    .run(delta, cardId);
}

export interface StatsRow {
  card_id: string;
  searches: number;
  views: number;
  favorites: number;
  owners: number;
  watch_up: number;
  watch_down: number;
}

export function getStats(cardId: string): StatsRow {
  ensureStats(cardId);
  return getDb()
    .prepare("SELECT * FROM card_stats WHERE card_id = ?")
    .get(cardId) as StatsRow;
}

export function logSearch(term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return;
  getDb()
    .prepare(
      `INSERT INTO search_log (term, count, last_at) VALUES (?, 1, ?)
       ON CONFLICT(term) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
    )
    .run(t, Date.now());
}
