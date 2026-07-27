import { NextRequest, NextResponse } from "next/server";
import { getOnePieceMeta, decklistEntries } from "@/lib/limitless";
import { getOnePieceCardByCode } from "@/lib/optcg";

export interface MetaDeckCard {
  code: string;
  name: string;
  count: number;
  group: string;
  cardId: string | null;
  image: string | null;
  unitUsd: number | null;
  lineUsd: number | null;
  cost: number | null;
  counterValue: number | null;
}

export async function GET(req: NextRequest) {
  const leader = req.nextUrl.searchParams.get("leader") ?? "";
  const meta = await getOnePieceMeta();
  const archetype = meta?.archetypes.find(
    (a) => a.leaderCode === leader.toUpperCase()
  );
  if (!archetype?.decklist) {
    return NextResponse.json({ error: "archetype not found" }, { status: 404 });
  }

  const entries = decklistEntries(archetype.decklist);
  const cards: MetaDeckCard[] = await Promise.all(
    entries.map(async (e) => {
      const card = await getOnePieceCardByCode(e.code).catch(() => null);
      const unit = card?.pricing.usd ?? null;
      return {
        code: e.code,
        name: card?.name ?? e.name,
        count: e.count,
        group: e.group,
        cardId: card?.id ?? null,
        image: card?.image ?? null,
        unitUsd: unit,
        lineUsd: unit != null ? unit * e.count : null,
        cost: card?.cost ?? null,
        counterValue: card?.counterValue ?? null,
      };
    })
  );

  const totalUsd = cards.reduce((s, c) => s + (c.lineUsd ?? 0), 0);
  const cardCount = cards.reduce((s, c) => s + c.count, 0);
  const priced = cards.filter((c) => c.unitUsd != null).length;
  const sim = cards.map((c) => `${c.count}x${c.code}`).join("\n");

  return NextResponse.json({
    leaderCode: archetype.leaderCode,
    name: archetype.name,
    sharePct: archetype.sharePct,
    count: archetype.count,
    tournament: archetype.tournament,
    cards,
    cardCount,
    totalUsd,
    pricedCards: priced,
    sim,
  });
}
