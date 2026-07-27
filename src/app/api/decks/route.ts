import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { DeckSummary } from "@/lib/types";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.description, d.updated_at,
              COALESCE(SUM(dc.qty), 0) AS card_count,
              COALESCE(SUM(dc.qty * COALESCE(rp.price_usd, cc.price_usd, 0)), 0) AS total_usd
       FROM decks d
       LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       LEFT JOIN op_cards cc ON cc.id = dc.card_id
       LEFT JOIN renaiss_prices rp ON rp.card_id = dc.card_id
       GROUP BY d.id
       ORDER BY d.updated_at DESC`
    )
    .all() as {
    id: number;
    name: string;
    description: string;
    updated_at: number;
    card_count: number;
    total_usd: number;
  }[];

  const decks: DeckSummary[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    cardCount: r.card_count,
    totalValueUsd: r.total_usd,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json({ decks });
}

export async function POST(req: NextRequest) {
  const { name, description } = (await req.json()) as {
    name?: string;
    description?: string;
  };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const now = Date.now();
  const r = getDb()
    .prepare(
      "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
    .run(name.trim(), description?.trim() ?? "", now, now);
  return NextResponse.json({ id: Number(r.lastInsertRowid) }, { status: 201 });
}
