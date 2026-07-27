import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCards } from "@/lib/optcg";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT card_id, added_at FROM favorites ORDER BY added_at DESC")
    .all() as { card_id: string; added_at: number }[];
  const cards = await getCards(rows.map((r) => r.card_id));
  const items = rows
    .map((r) => cards.get(r.card_id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  return NextResponse.json({ items });
}
