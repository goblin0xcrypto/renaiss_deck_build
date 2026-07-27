import { NextRequest, NextResponse } from "next/server";
import { getDb, bumpStat } from "@/lib/db";
import { getCard, getCards } from "@/lib/optcg";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT card_id, qty, added_at FROM collection ORDER BY added_at DESC")
    .all() as { card_id: string; qty: number; added_at: number }[];
  const cards = await getCards(rows.map((r) => r.card_id));
  const items = rows.map((r) => ({
    card: cards.get(r.card_id) ?? null,
    cardId: r.card_id,
    qty: r.qty,
  }));
  const totalValueUsd = items.reduce(
    (sum, it) => sum + (it.card?.pricing.usd ?? 0) * it.qty,
    0
  );
  return NextResponse.json({ items, totalValueUsd });
}

export async function POST(req: NextRequest) {
  const { cardId, qty } = (await req.json()) as { cardId: string; qty: number };
  if (!cardId || typeof qty !== "number") {
    return NextResponse.json({ error: "cardId and qty required" }, { status: 400 });
  }
  const card = await getCard(cardId);
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }
  const db = getDb();
  const existing = db
    .prepare("SELECT qty FROM collection WHERE card_id = ?")
    .get(cardId) as { qty: number } | undefined;

  if (qty <= 0) {
    db.prepare("DELETE FROM collection WHERE card_id = ?").run(cardId);
    if (existing) bumpStat(cardId, "owners", -1);
  } else if (existing) {
    db.prepare("UPDATE collection SET qty = ? WHERE card_id = ?").run(qty, cardId);
  } else {
    db.prepare("INSERT INTO collection (card_id, qty, added_at) VALUES (?, ?, ?)").run(
      cardId,
      qty,
      Date.now()
    );
    bumpStat(cardId, "owners");
  }
  return NextResponse.json({ ok: true, qty: Math.max(0, qty) });
}
