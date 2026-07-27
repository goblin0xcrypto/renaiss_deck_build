import { NextRequest, NextResponse } from "next/server";
import { getDb, bumpStat } from "@/lib/db";
import { getCard } from "@/lib/optcg";

type Action = "favorite" | "unfavorite" | "watch_up" | "watch_down";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = (await req.json()) as { action: Action };
  const db = getDb();

  // Make sure the card exists (and gets cached for later listing pages)
  const card = await getCard(id);
  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  switch (action) {
    case "favorite": {
      const r = db
        .prepare("INSERT OR IGNORE INTO favorites (card_id, added_at) VALUES (?, ?)")
        .run(id, Date.now());
      if (r.changes > 0) bumpStat(id, "favorites");
      break;
    }
    case "unfavorite": {
      const r = db.prepare("DELETE FROM favorites WHERE card_id = ?").run(id);
      if (r.changes > 0) bumpStat(id, "favorites", -1);
      break;
    }
    case "watch_up":
      bumpStat(id, "watch_up");
      break;
    case "watch_down":
      bumpStat(id, "watch_down");
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
