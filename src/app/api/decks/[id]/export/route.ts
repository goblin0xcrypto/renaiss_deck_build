import { NextRequest, NextResponse } from "next/server";
import { loadDeck } from "@/lib/decks";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deck = await loadDeck(Number(id));
  if (!deck) return NextResponse.json({ error: "deck not found" }, { status: 404 });

  const format = req.nextUrl.searchParams.get("format") ?? "txt";
  // HTTP headers only allow Latin-1; keep an ASCII fallback and pass the
  // full UTF-8 name via RFC 5987 filename*
  const ascii = deck.name.replace(/[^\x20-\x7E]+/g, "").replace(/[^\w-]+/g, "_") || "deck";
  const utf8 = encodeURIComponent(deck.name);
  const disposition = (ext: string) =>
    `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${utf8}.${ext}`;

  if (format === "json") {
    const payload = {
      name: deck.name,
      description: deck.description,
      exportedAt: new Date().toISOString(),
      cardCount: deck.cardCount,
      totalValueUsd: Number(deck.totalValueUsd.toFixed(2)),
      cards: deck.cards.map((e) => ({
        id: e.card.id,
        name: e.card.name,
        set: e.card.setName,
        number: e.card.localId,
        qty: e.qty,
        unitPriceUsd: e.card.pricing.usd,
      })),
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": disposition("json"),
      },
    });
  }

  const lines = [
    `// ${deck.name} — ${deck.cardCount} cards — $${deck.totalValueUsd.toFixed(2)} USD`,
    ...deck.cards.map(
      (e) => `${e.qty} ${e.card.name} (${e.card.setId?.toUpperCase()} ${e.card.localId})`
    ),
  ];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": disposition("txt"),
    },
  });
}
