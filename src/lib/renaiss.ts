import { getDb, kvGet, kvSet } from "./db";
import type { CardDetail, CardSummary } from "./types";

/**
 * Price source: Renaiss OS Index (api.renaissos.com). Prices are looked up
 * on demand per card code via `/v1/search?q=<code>` and cached locally in
 * `renaiss_prices` (24h TTL, per-printing rows). Only English RAW (ungraded)
 * tiers are used — best condition first (Raw A > B > C > D) — and Renaiss
 * variation print numbers ("Super Rare 2") are matched to our printing ids
 * (`OP16-056` = print 1, `OP16-056_p1` = print 2). Cards Renaiss doesn't
 * cover keep their TCGPlayer price as a labelled fallback.
 *
 * Partner keys (X-Api-Key / X-Api-Secret in .env.local) lift the daily rate
 * limit to 10k req/day, but Renaiss also enforces a much tighter short-window
 * burst limit that a naive concurrent blast trips well before the daily cap
 * is anywhere close to used — so requests are paced with both a low
 * concurrency cap and a minimum spacing between request starts (see
 * MAX_CONCURRENT/MIN_INTERVAL_MS below), plus a per-request fetch budget. A
 * 429 backs off for exactly as long as the API's own `Retry-After` header
 * says, falling back to a short default only if that header is missing, and
 * capped so a single bad response can never stall pricing for very long.
 */

const API = "https://api.renaissos.com";
const PRICE_TTL_MS = 1000 * 60 * 60 * 24;
const FETCH_BUDGET = 24; // max uncached codes fetched per overlay call
// The 10k/day partner quota is generous, but Renaiss also enforces a much
// tighter short-window burst limit that a naive 4-wide concurrent blast
// trips almost immediately (observed in production: 429s within seconds of
// a page load's worth of lookups, nowhere near the daily cap). Keep both
// low — a slower fill-in beats an hour-long outage every time it happens.
const MAX_CONCURRENT = 2; // global cap on in-flight Renaiss requests
const MIN_INTERVAL_MS = 350; // minimum spacing between request starts
const BACKOFF_KEY = "renaiss-backoff-until";
const DEFAULT_BACKOFF_MS = 1000 * 30; // used only when Retry-After is absent
const MAX_BACKOFF_MS = 1000 * 60 * 10; // ceiling, however long Retry-After asks for

interface RenaissSearchResult {
  game: string;
  name: string;
  setName: string | null;
  setCode: string | null;
  cardNumber: string | null;
  variation: string | null;
  language: string | null;
  company: string | null;
  grade: string | null;
  gradeLabel: string;
  priceUsdCents: number | null;
  confidence: string | null;
  lastSaleAt: string | null;
  href: string;
}

interface RenaissPriceRow {
  card_id: string;
  code: string;
  price_usd: number;
  grade_label: string | null;
  confidence: string | null;
  href: string | null;
  last_sale_at: string | null;
  fetched_at: number;
}

function authHeaders(): Record<string, string> {
  const key = process.env.RENAISS_API_KEY ?? process.env["X-Api-Key"];
  const secret = process.env.RENAISS_API_SECRET ?? process.env["X-Api-Secret"];
  const h: Record<string, string> = { "User-Agent": "renaiss-deck-build/1.0" };
  if (key && secret) {
    h["X-Api-Key"] = key;
    h["X-Api-Secret"] = secret;
  }
  return h;
}

/** Print number of a Renaiss variation ("Super Rare 2" → 2, "Leader" → 1). */
function variationIndex(variation: string | null): number {
  const m = variation?.match(/ (\d+)$/);
  return m ? Number(m[1]) : 1;
}

/**
 * Print number of one of our printing ids (OP16-056 → 1, OP16-056_p1 → 2).
 * Promo printings (_prN) and other suffixes have no Renaiss variation
 * counterpart — Renaiss files those under separate promo set groupings — so
 * they must never inherit a variation-number match (null = unmatchable).
 */
function printingIndex(id: string): number | null {
  const m = id.match(/_p(\d+)$/i);
  if (m) return Number(m[1]) + 1;
  return id.includes("_") ? null : 1;
}

function gradeRank(grade: string | null): number {
  const i = ["A", "B", "C", "D"].indexOf(grade ?? "");
  return i === -1 ? 99 : i;
}

// ---- display-only graded matching (no raw tier available) ----------------
// Renaiss files promo/special versions under their own set groupings (e.g.
// "Dodgers One Piece Night"), so they can't be keyed by variation number.
// We match by word overlap between the Renaiss set-grouping name and our
// catalog names instead, and never let these prices into the effective price.

const STOPWORDS = new Set([
  "one", "piece", "card", "game", "the", "of", "and", "a", "in",
  "collection", "promo", "promos", "promotion", "edition", "vol",
]);

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

const COMPANY_ORDER = ["PSA", "BGS", "CGC", "SGC", "TAG"];

/** Numeric grade of a graded tier ("10 Gem Mint" → 10, "9.5 Mint" → 9.5). */
function gradedNum(grade: string | null): number {
  const m = /^(\d+(?:\.\d+)?)/.exec(grade ?? "");
  return m ? Number(m[1]) : 0;
}

/** Lower = better display tier: Raw A..D first, then grades descending. */
function displayTierRank(r: RenaissSearchResult): number {
  if (r.company === "RAW") return Math.min(gradeRank(r.grade), 3);
  const company = COMPANY_ORDER.indexOf(r.company ?? "");
  return 10 + (10 - gradedNum(r.grade)) * 10 + (company === -1 ? 9 : company);
}

// Global request limiter + per-code dedupe, shared across concurrent routes.
// Paces requests two ways: a concurrency cap (MAX_CONCURRENT in flight at
// once) and a minimum spacing between request starts (MIN_INTERVAL_MS) —
// the cap alone still lets requests fire back-to-back the instant a slot
// frees up, which is exactly the kind of burst that trips Renaiss's limiter.
let inFlight = 0;
let lastStart = 0;
const waiters: (() => void)[] = [];
const inFlightByCode = new Map<string, Promise<void>>();

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  const wait = lastStart + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastStart = Date.now();
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

/**
 * GET a Renaiss API path as JSON through the global limiter. Returns null on
 * any failure (and starts a backoff on 429 — see `DEFAULT_BACKOFF_MS` above).
 */
export async function renaissApiJson(path: string): Promise<unknown | null> {
  const backoffUntil =
    kvGet<number>(BACKOFF_KEY, Number.MAX_SAFE_INTEGER)?.value ?? 0;
  if (Date.now() < backoffUntil) return null;
  return withSlot(async () => {
    const reqHeaders = authHeaders();
    // Masked fingerprint of what we actually sent on THIS request — proves
    // (or disproves) whether the anonymous-tier downgrade correlates with
    // us ever sending a key-less/malformed request, rather than just
    // confirming the env var exists in general.
    const sentKeyFingerprint = reqHeaders["X-Api-Key"]
      ? `${reqHeaders["X-Api-Key"].slice(0, 6)}…${reqHeaders["X-Api-Key"].slice(-4)} (len ${reqHeaders["X-Api-Key"].length})`
      : "MISSING";
    const sentSecretPresent = !!reqHeaders["X-Api-Secret"];
    const res = await fetch(`${API}${path}`, {
      headers: reqHeaders,
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!res) return null;
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS)
          : DEFAULT_BACKOFF_MS;
      kvSet(BACKOFF_KEY, Date.now() + waitMs);
      // Full detail for reporting to Renaiss (their response only — no
      // request secrets in here), so a recurrence is captured in `railway
      // logs` instead of only leaving a bare timestamp behind.
      const body = await res.text().catch(() => "");
      console.error(
        "[renaiss] 429 rate limited:",
        JSON.stringify({
          time: new Date().toISOString(),
          path,
          sentKeyFingerprint,
          sentSecretPresent,
          waitMs,
          responseHeaders: Object.fromEntries(res.headers.entries()),
          body: body.slice(0, 2000),
        })
      );
      return null;
    }
    if (!res.ok) return null;
    return res.json().catch(() => null);
  });
}

/** Fetch one card code from Renaiss and cache its raw-English prices. */
async function fetchCode(code: string): Promise<void> {
  const body = (await renaissApiJson(
    `/v1/search?q=${encodeURIComponent(code)}&limit=30`
  )) as { results?: RenaissSearchResult[] } | null;
  if (!body) return; // error — retried on a later request
  const results = body.results ?? [];

  // English ungraded tiers of exactly this card code, best grade per print.
  const candidates = results.filter(
    (r) =>
      r.game === "one-piece" &&
      r.language === "English" &&
      r.company === "RAW" &&
      r.priceUsdCents != null &&
      `${r.setCode}-${r.cardNumber}`.toUpperCase() === code
  );
  const byPrint = new Map<number, RenaissSearchResult>();
  for (const c of candidates) {
    const idx = variationIndex(c.variation);
    const prev = byPrint.get(idx);
    if (!prev || gradeRank(c.grade) < gradeRank(prev.grade)) byPrint.set(idx, c);
  }

  const db = getDb();
  const printings = db
    .prepare("SELECT id, name, set_name FROM op_cards WHERE code = ? COLLATE NOCASE")
    .all(code) as { id: string; name: string; set_name: string | null }[];

  // Display-only pool: any English tier (graded or raw) of this code
  const displayPool = results.filter(
    (r) =>
      r.game === "one-piece" &&
      r.language === "English" &&
      r.priceUsdCents != null &&
      `${r.setCode}-${r.cardNumber}`.toUpperCase() === code
  );

  /** Best display entry for a printing, or null when nothing matches safely. */
  const displayMatch = (p: {
    id: string;
    name: string;
    set_name: string | null;
  }): RenaissSearchResult | null => {
    const idx = printingIndex(p.id);
    const cardName = tokens(p.name.split("(")[0]); // "Monkey.D.Luffy"
    const setTokens = tokens(p.set_name);
    // promo label: everything after the base card name, e.g. "(Dodgers x ONE PIECE)"
    const paren = p.name.indexOf("(");
    const promoLabel = tokens(paren === -1 ? "" : p.name.slice(paren));
    const scored = displayPool
      .map((r) => {
        const grouping = tokens(r.setName);
        let score: number;
        if (idx != null) {
          // set-numbered printing: variation number must agree, grouping must
          // look like our set or a card-family grouping ("...Monkey.D.Luffy")
          if (variationIndex(r.variation) !== idx) return null;
          const setScore = overlap(grouping, setTokens);
          const familyScore = overlap(grouping, cardName);
          if (setScore === 0 && familyScore === 0) return null;
          score = setScore * 2 + familyScore;
        } else {
          // promo printing: grouping must share a distinctive word with the
          // promo label (card-name words are stripped from the label side)
          const labelScore = overlap(grouping, promoLabel);
          if (labelScore === 0) return null;
          score = labelScore;
        }
        return { r, score };
      })
      .filter((x): x is { r: RenaissSearchResult; score: number } => x !== null)
      .sort(
        (a, b) => b.score - a.score || displayTierRank(a.r) - displayTierRank(b.r)
      );
    return scored[0]?.r ?? null;
  };

  const now = Date.now();
  db.transaction(() => {
    db.prepare("DELETE FROM renaiss_prices WHERE code = ?").run(code);
    db.prepare("DELETE FROM renaiss_graded WHERE code = ?").run(code);
    const ins = db.prepare(
      `INSERT OR REPLACE INTO renaiss_prices
         (card_id, code, price_usd, grade_label, confidence, href, last_sale_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insGraded = db.prepare(
      `INSERT OR REPLACE INTO renaiss_graded
         (card_id, code, price_usd, grade_label, confidence, href, last_sale_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of printings) {
      const idx = printingIndex(p.id);
      const raw = idx != null ? byPrint.get(idx) : undefined;
      if (raw) {
        ins.run(
          p.id,
          code,
          (raw.priceUsdCents as number) / 100,
          raw.gradeLabel,
          raw.confidence,
          raw.href,
          raw.lastSaleAt,
          now
        );
        continue;
      }
      // no effective (raw-English) price — cache the best tier for display only
      const show = displayMatch(p);
      if (!show) continue;
      insGraded.run(
        p.id,
        code,
        (show.priceUsdCents as number) / 100,
        show.gradeLabel,
        show.confidence,
        show.href,
        show.lastSaleAt,
        now
      );
    }
    db.prepare(
      `INSERT INTO renaiss_fetches (code, fetched_at) VALUES (?, ?)
       ON CONFLICT(code) DO UPDATE SET fetched_at = excluded.fetched_at`
    ).run(code, now);
  })();
}

/**
 * Overlay Renaiss OS Index prices onto cards in place. Cached prices apply
 * instantly; at most FETCH_BUDGET uncached/stale codes are fetched per call,
 * the rest keep their TCGPlayer fallback until a later request tops them up.
 */
export async function overlayRenaissPrices(
  cards: (CardSummary | CardDetail)[]
): Promise<void> {
  if (cards.length === 0) return;
  const db = getDb();
  const codes = [
    ...new Set(cards.map((c) => c.localId?.toUpperCase()).filter(Boolean)),
  ] as string[];

  const fetchedStmt = db.prepare(
    "SELECT fetched_at FROM renaiss_fetches WHERE code = ?"
  );
  const now = Date.now();
  const stale = codes.filter((code) => {
    const row = fetchedStmt.get(code) as { fetched_at: number } | undefined;
    return !row || now - row.fetched_at > PRICE_TTL_MS;
  });

  const backoffUntil =
    kvGet<number>(BACKOFF_KEY, Number.MAX_SAFE_INTEGER)?.value ?? 0;
  if (stale.length > 0 && now > backoffUntil) {
    await Promise.all(
      stale.slice(0, FETCH_BUDGET).map((code) => {
        const running = inFlightByCode.get(code);
        if (running) return running;
        // fetchCode goes through the limiter itself (renaissApiJson)
        const p = fetchCode(code).finally(() => inFlightByCode.delete(code));
        inFlightByCode.set(code, p);
        return p;
      })
    );
  }

  const priceStmt = db.prepare("SELECT * FROM renaiss_prices WHERE card_id = ?");
  for (const card of cards) {
    const row = priceStmt.get(card.id) as RenaissPriceRow | undefined;
    if (row) {
      card.priceUsd = row.price_usd;
      card.priceSource = "renaiss";
      if ("pricing" in card) {
        card.pricing = {
          ...card.pricing, // keeps tcgUsd / usdLow / tcgUpdated for side-by-side
          usd: row.price_usd,
          source: "renaiss",
          gradeLabel: row.grade_label,
          confidence: row.confidence,
          renaissHref: row.href,
          updated: (row.last_sale_at ?? new Date(row.fetched_at).toISOString())
            .slice(0, 10),
        };
      }
    } else {
      if (card.priceUsd != null) card.priceSource = "tcgplayer";
      if ("pricing" in card) {
        card.pricing.source = card.pricing.usd != null ? "tcgplayer" : null;
      }
    }
  }
}
