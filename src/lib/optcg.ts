import { getDb, kvGet, kvSet } from "./db";
import { overlayRenaissPrices } from "./renaiss";
import type { CardDetail, CardSummary } from "./types";

/**
 * Card data source: OPTCG API (optcgapi.com), a free community One Piece TCG
 * database. The whole catalog (~5k printings, ~2.5MB over 3 requests) is
 * synced into the local `op_cards` table once a day; search, pagination and
 * card lookups are then served entirely from SQLite.
 *
 * Card ids are optcgapi's `card_image_id` — one id per printing, where the
 * base printing's id equals the card code (OP16-056) and variants get a
 * suffix (OP16-056_p1).
 */

const API = "https://optcgapi.com/api";
const SYNC_TTL_MS = 1000 * 60 * 60 * 24;

export interface SearchResult {
  cards: CardSummary[];
  matchedSet: { id: string; name: string } | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface OpCardRow {
  id: string;
  code: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  category: string | null;
  color: string | null;
  cost: string | null;
  power: string | null;
  counter: number | null;
  attribute: string | null;
  sub_types: string | null;
  life: string | null;
  text: string | null;
  image: string | null;
  price_usd: number | null;
  price_low: number | null;
  date_scraped: string | null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "renaiss-deck-build/1.0" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let syncPromise: Promise<void> | null = null;

/** Sync the full optcgapi catalog into SQLite (24h TTL, stale kept on failure). */
async function ensureCatalog(): Promise<void> {
  const db = getDb();
  const state = kvGet<number>("optcg-synced-at", SYNC_TTL_MS);
  const haveRows =
    (db.prepare("SELECT COUNT(*) AS n FROM op_cards").get() as { n: number }).n > 0;
  if (state && !state.stale && haveRows) return;
  if (syncPromise) return syncPromise; // dedupe concurrent syncs

  syncPromise = (async () => {
    const [setCards, stCards, promos] = await Promise.all([
      fetchJson(`${API}/allSetCards/`),
      fetchJson(`${API}/allSTCards/`),
      fetchJson(`${API}/allPromos/`),
    ]);
    const canonical = [setCards, stCards].filter(Array.isArray).flat() as any[];
    const promoRows = (Array.isArray(promos) ? promos : []) as any[];
    const rows = [...canonical, ...promoRows];
    if (rows.length < 1000) {
      // Source unreachable or truncated — keep whatever we already have
      if (!haveRows) throw new Error("optcgapi catalog sync failed");
      return;
    }
    const insert = db.prepare(
      `INSERT INTO op_cards
       (id, code, name, set_id, set_name, rarity, category, color, cost, power,
        counter, attribute, sub_types, life, text, image, price_usd, price_low, date_scraped)
       VALUES (@id, @code, @name, @set_id, @set_name, @rarity, @category, @color, @cost, @power,
        @counter, @attribute, @sub_types, @life, @text, @image, @price_usd, @price_low, @date_scraped)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, set_id=excluded.set_id, set_name=excluded.set_name,
         rarity=excluded.rarity, category=excluded.category, color=excluded.color,
         cost=excluded.cost, power=excluded.power, counter=excluded.counter,
         attribute=excluded.attribute, sub_types=excluded.sub_types, life=excluded.life,
         text=excluded.text, image=excluded.image, price_usd=excluded.price_usd,
         price_low=excluded.price_low, date_scraped=excluded.date_scraped`
    );
    // Promo entries reuse the base printing's card_image_id — insert them
    // last and never let them overwrite canonical set / starter-deck rows.
    const insertPromo = db.prepare(
      insert.source.replace(
        /ON CONFLICT\(id\) DO UPDATE SET[\s\S]*$/,
        "ON CONFLICT(id) DO NOTHING"
      )
    );
    db.transaction(() => {
      const run = (c: any, stmt: typeof insert) => {
        const code = c.card_set_id;
        if (!code) return; // Don!! cards etc. have no code
        stmt.run({
          id: c.card_image_id || code,
          code,
          name: c.card_name ?? code,
          set_id: c.set_id ?? null,
          set_name: c.set_name ?? null,
          rarity: c.rarity ?? null,
          category: c.card_type ?? null,
          color: c.card_color ?? null,
          cost: c.card_cost != null ? String(c.card_cost) : null,
          power: c.card_power != null ? String(c.card_power) : null,
          counter: typeof c.counter_amount === "number" ? c.counter_amount : null,
          attribute: c.attribute ?? null,
          sub_types: c.sub_types ?? null,
          life: c.life != null ? String(c.life) : null,
          text: c.card_text ?? null,
          image: c.card_image ?? null,
          price_usd: typeof c.market_price === "number" ? c.market_price : null,
          price_low: typeof c.inventory_price === "number" ? c.inventory_price : null,
          date_scraped: c.date_scraped ?? null,
        });
      };
      for (const c of canonical) run(c, insert);
      for (const c of promoRows) run(c, insertPromo);
    })();
    kvSet("optcg-synced-at", Date.now());
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

function statsLine(r: OpCardRow): string {
  const parts: string[] = [];
  if (r.category) parts.push(r.category);
  if (r.color) parts.push(r.color);
  if (r.category === "Leader" && r.life) parts.push(`Life ${r.life}`);
  if (r.cost && r.category !== "Leader") parts.push(`Cost ${r.cost}`);
  if (r.power) parts.push(`Power ${r.power}`);
  if (r.counter) parts.push(`Counter ${r.counter}`);
  if (r.attribute) parts.push(r.attribute);
  if (r.sub_types) parts.push(r.sub_types);
  return parts.join(" · ");
}

function toSummary(r: OpCardRow): CardSummary {
  return {
    id: r.id,
    localId: r.code,
    name: r.name,
    image: r.image,
    setId: r.set_id ?? undefined,
    setName: r.set_name ?? undefined,
    priceUsd: r.price_usd,
    priceTcgUsd: r.price_usd,
  };
}

function toDetail(r: OpCardRow): CardDetail {
  const stats = statsLine(r);
  return {
    ...toSummary(r),
    imageLarge: r.image,
    category: r.category ?? "Card",
    rarity: r.rarity,
    illustrator: null,
    hp: null,
    types: [r.color, r.attribute].filter((v): v is string => !!v),
    description: [stats, r.text].filter(Boolean).join("\n\n") || null,
    setLogo: null,
    setCardCount: null,
    pricing: {
      usd: r.price_usd,
      usdLow: r.price_low,
      tcgUsd: r.price_usd,
      eur: null,
      updated: r.date_scraped,
      tcgUpdated: r.date_scraped,
    },
    cost: r.cost != null && /^\d+$/.test(r.cost) ? Number(r.cost) : null,
    counterValue: r.counter,
  };
}

export async function getCard(id: string): Promise<CardDetail | null> {
  await ensureCatalog().catch(() => {});
  const row = getDb()
    .prepare("SELECT * FROM op_cards WHERE id = ?")
    .get(id) as OpCardRow | undefined;
  if (!row) return null;
  const detail = toDetail(row);
  await overlayRenaissPrices([detail]);
  return detail;
}

export async function getCards(ids: string[]): Promise<Map<string, CardDetail>> {
  await ensureCatalog().catch(() => {});
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM op_cards WHERE id = ?");
  const out = new Map<string, CardDetail>();
  for (const id of ids) {
    const row = stmt.get(id) as OpCardRow | undefined;
    if (row) out.set(id, toDetail(row));
  }
  await overlayRenaissPrices([...out.values()]);
  return out;
}

/** Resolve a card code (OP16-022) to its base printing (or cheapest variant). */
export async function getOnePieceCardByCode(code: string): Promise<CardDetail | null> {
  await ensureCatalog().catch(() => {});
  const rows = getDb()
    .prepare("SELECT * FROM op_cards WHERE code = ? COLLATE NOCASE")
    .all(code) as OpCardRow[];
  if (rows.length === 0) return null;
  const base =
    rows.find((r) => r.id.toUpperCase() === code.toUpperCase()) ??
    [...rows].sort(
      (a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity)
    )[0];
  const detail = toDetail(base);
  await overlayRenaissPrices([detail]);
  return detail;
}

/**
 * Smart search, all served locally, always returning the full result set:
 *  1. "OP16-001"-style queries → all printings of that code
 *  2. "OP16" / "ST01" / "EB01"-style queries → the whole set
 *  3. anything else → name search
 */
export async function searchCards(q: string): Promise<SearchResult> {
  const query = q.trim();
  const empty: SearchResult = { cards: [], matchedSet: null };
  if (!query) return empty;
  await ensureCatalog().catch(() => {});
  const db = getDb();

  if (/^[a-z0-9]{1,10}-[0-9]{1,4}$/i.test(query)) {
    const rows = db
      .prepare("SELECT * FROM op_cards WHERE code = ? COLLATE NOCASE ORDER BY id")
      .all(query) as OpCardRow[];
    if (rows.length > 0) {
      const cards = rows.map(toSummary);
      await overlayRenaissPrices(cards);
      return { cards, matchedSet: null };
    }
  }

  if (/^[a-z]{1,8}([-\s]?[0-9]{1,4})?([-\s]?[a-z]{2}[0-9]{0,4})?$/i.test(query)) {
    const prefix = query.toUpperCase().replace(/[\s-]/g, "");
    // Prefer the set membership (set_id "OP-16") — it includes reprints whose
    // codes belong to older sets — and fall back to a card-code prefix.
    // Promo groups reuse dash-less codes ("ST01"), so when several set_ids
    // normalize alike, pick the official dashed one.
    const setIds = (
      db
        .prepare(
          "SELECT DISTINCT set_id FROM op_cards WHERE REPLACE(UPPER(set_id), '-', '') = ?"
        )
        .all(prefix) as { set_id: string | null }[]
    )
      .map((r) => r.set_id)
      .filter((s): s is string => !!s);
    const chosenSet = setIds.find((s) => s.includes("-")) ?? setIds[0];
    let rows: OpCardRow[] = chosenSet
      ? (db
          .prepare("SELECT * FROM op_cards WHERE set_id = ? ORDER BY code, id")
          .all(chosenSet) as OpCardRow[])
      : [];
    if (rows.length === 0) {
      rows = db
        .prepare("SELECT * FROM op_cards WHERE code LIKE ? ORDER BY code, id")
        .all(`${prefix}-%`) as OpCardRow[];
    }
    if (rows.length > 0) {
      const cards = rows.map(toSummary);
      await overlayRenaissPrices(cards);
      return {
        cards,
        matchedSet: {
          id: rows[0].set_id ?? prefix,
          name: rows[0].set_name ?? prefix,
        },
      };
    }
  }

  const rows = db
    .prepare(
      `SELECT * FROM op_cards WHERE name LIKE ? COLLATE NOCASE
       ORDER BY name, code`
    )
    .all(`%${query}%`) as OpCardRow[];
  const cards = rows.map(toSummary);
  await overlayRenaissPrices(cards);
  return { cards, matchedSet: null };
}
