import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface StatCardRow {
  card_id: string;
  name: string | null;
  image: string | null;
  set_name: string | null;
  local_id: string | null;
  price_usd: number | null;
  searches: number;
  views: number;
  favorites: number;
  owners: number;
  watch_up: number;
  watch_down: number;
}

export async function GET() {
  const db = getDb();
  const base = `
    SELECT s.card_id, cc.name, cc.image, cc.set_name, cc.code AS local_id,
           COALESCE(rp.price_usd, cc.price_usd) AS price_usd,
           s.searches, s.views, s.favorites, s.owners, s.watch_up, s.watch_down
    FROM card_stats s
    LEFT JOIN op_cards cc ON cc.id = s.card_id
    LEFT JOIN renaiss_prices rp ON rp.card_id = s.card_id`;

  const topSearched = db
    .prepare(`${base} WHERE s.searches > 0 ORDER BY s.searches DESC LIMIT 10`)
    .all() as StatCardRow[];
  const topFavorited = db
    .prepare(`${base} WHERE s.favorites > 0 ORDER BY s.favorites DESC LIMIT 10`)
    .all() as StatCardRow[];
  const topOwned = db
    .prepare(`${base} WHERE s.owners > 0 ORDER BY s.owners DESC LIMIT 10`)
    .all() as StatCardRow[];
  const sentiment = db
    .prepare(
      `${base} WHERE s.watch_up + s.watch_down > 0
       ORDER BY (s.watch_up + s.watch_down) DESC LIMIT 10`
    )
    .all() as StatCardRow[];
  const topTerms = db
    .prepare("SELECT term, count FROM search_log ORDER BY count DESC LIMIT 10")
    .all() as { term: string; count: number }[];

  return NextResponse.json({ topSearched, topFavorited, topOwned, sentiment, topTerms });
}
