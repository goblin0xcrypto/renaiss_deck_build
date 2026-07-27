import { NextRequest, NextResponse } from "next/server";
import { getCard } from "@/lib/optcg";
import { getDb, getStats, bumpStat } from "@/lib/db";
import type { CardWithState } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }
  bumpStat(id, "views");
  const db = getDb();
  const stats = getStats(id);
  const fav = db.prepare("SELECT 1 FROM favorites WHERE card_id = ?").get(id);
  const col = db
    .prepare("SELECT qty FROM collection WHERE card_id = ?")
    .get(id) as { qty: number } | undefined;

  const payload: CardWithState = {
    card,
    stats: {
      searches: stats.searches,
      views: stats.views,
      favorites: stats.favorites,
      owners: stats.owners,
      watchUp: stats.watch_up,
      watchDown: stats.watch_down,
    },
    favorited: !!fav,
    collectionQty: col?.qty ?? 0,
  };
  return NextResponse.json(payload);
}
