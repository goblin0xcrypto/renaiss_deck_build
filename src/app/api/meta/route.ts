import { NextResponse } from "next/server";
import { getOnePieceMeta } from "@/lib/limitless";

export async function GET() {
  const meta = await getOnePieceMeta();
  if (!meta) {
    return NextResponse.json(
      { error: "meta data unavailable right now" },
      { status: 503 }
    );
  }
  // Don't ship full decklists to the homepage grid; the modal fetches details.
  return NextResponse.json({
    ...meta,
    archetypes: meta.archetypes.map(({ decklist: _decklist, ...rest }) => rest),
  });
}
