import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOnePieceMeta, decklistEntries } from "@/lib/limitless";
import { getOnePieceCardByCode } from "@/lib/optcg";

/** Create a deck in the builder from a meta archetype's representative decklist. */
async function importArchetype(
  leaderCode: string
): Promise<{ deckId: number; missing: string[]; missingCopies: number } | null> {
  const meta = await getOnePieceMeta();
  const archetype = meta?.archetypes.find(
    (a) => a.leaderCode === leaderCode.toUpperCase()
  );
  if (!archetype?.decklist) return null;

  const entries = decklistEntries(archetype.decklist);
  const resolved = await Promise.all(
    entries.map(async (e) => ({
      entry: e,
      card: await getOnePieceCardByCode(e.code).catch(() => null),
    }))
  );
  // Cards Limitless's decklist references that our catalog hasn't synced yet
  // (a new set, e.g. ST32) can't be inserted into deck_cards — there's no
  // op_cards row to point at. They're dropped silently from the deck build,
  // so the description records what/how many got left out.
  const missingEntries = resolved.filter((r) => !r.card);
  const missing = missingEntries.map((r) => r.entry.code);
  const missingCopies = missingEntries.reduce((s, r) => s + r.entry.count, 0);

  const db = getDb();
  const now = Date.now();
  const missingNote =
    missingCopies > 0
      ? ` · ${missingCopies} card${missingCopies === 1 ? "" : "s"} (${missing.join(", ")}) not yet in the catalog, excluded`
      : "";
  const r = db
    .prepare(
      "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
    .run(
      `${archetype.name} (Meta)`,
      `Imported from Limitless meta · leader ${archetype.leaderCode}` +
        (archetype.tournament ? ` · ${archetype.tournament}` : "") +
        missingNote,
      now,
      now
    );
  const deckId = Number(r.lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?, ?, ?)
     ON CONFLICT(deck_id, card_id) DO UPDATE SET qty = qty + excluded.qty`
  );
  for (const { entry, card } of resolved) {
    if (card) insert.run(deckId, card.id, entry.count);
  }

  return { deckId, missing, missingCopies };
}

export async function POST(req: NextRequest) {
  const { leader } = (await req.json()) as { leader?: string };
  const result = await importArchetype(leader ?? "");
  if (!result) {
    return NextResponse.json({ error: "archetype not found" }, { status: 404 });
  }
  return NextResponse.json(result, { status: 201 });
}

/**
 * Behind Railway's edge proxy, `req.url` reflects the internal
 * request (e.g. `http://localhost:8080/...`) — building a redirect target
 * from it sends every external client (a phone scanning the deck-poster QR
 * code, in particular) to an address only reachable from inside the
 * container. `X-Forwarded-Host`/`X-Forwarded-Proto` carry the real
 * client-facing host; `req.nextUrl` is the correct fallback for local dev,
 * where there's no proxy in front and those headers aren't set.
 */
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * GET variant of the same import, for use as a plain scannable/shareable
 * link (the deck-poster QR code encodes this URL): creates the deck, then
 * redirects straight to its builder page. Each visit creates a fresh deck —
 * that's the intended one-tap "load this deck" behavior for a QR scan.
 */
export async function GET(req: NextRequest) {
  const leader = req.nextUrl.searchParams.get("leader") ?? "";
  const result = await importArchetype(leader);
  if (!result) {
    return NextResponse.json({ error: "archetype not found" }, { status: 404 });
  }
  return NextResponse.redirect(
    new URL(`/decks/${result.deckId}`, publicOrigin(req))
  );
}
