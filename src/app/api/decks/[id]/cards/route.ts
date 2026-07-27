import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCard } from "@/lib/optcg";

// Set the quantity of a card in a deck (qty 0 removes it, delta adjusts)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deckId = Number(id);
  const { cardId, qty, delta } = (await req.json()) as {
    cardId: string;
    qty?: number;
    delta?: number;
  };
  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  const db = getDb();
  const deck = db.prepare("SELECT id FROM decks WHERE id = ?").get(deckId);
  if (!deck) return NextResponse.json({ error: "deck not found" }, { status: 404 });

  const card = await getCard(cardId);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const current =
    (db
      .prepare("SELECT qty FROM deck_cards WHERE deck_id = ? AND card_id = ?")
      .get(deckId, cardId) as { qty: number } | undefined)?.qty ?? 0;

  const next = Math.max(0, qty ?? current + (delta ?? 0));
  if (next === 0) {
    db.prepare("DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ?").run(
      deckId,
      cardId
    );
  } else {
    db.prepare(
      `INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?, ?, ?)
       ON CONFLICT(deck_id, card_id) DO UPDATE SET qty = excluded.qty`
    ).run(deckId, cardId, next);
  }
  db.prepare("UPDATE decks SET updated_at = ? WHERE id = ?").run(Date.now(), deckId);
  return NextResponse.json({ ok: true, qty: next });
}
