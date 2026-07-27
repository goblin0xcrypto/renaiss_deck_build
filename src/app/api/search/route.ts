import { NextRequest, NextResponse } from "next/server";
import { searchCards } from "@/lib/optcg";
import { logSearch, bumpStat } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ cards: [], matchedSet: null });
  }

  const result = await searchCards(q);
  logSearch(q);
  result.cards.slice(0, 20).forEach((c) => bumpStat(c.id, "searches"));
  return NextResponse.json(result);
}
