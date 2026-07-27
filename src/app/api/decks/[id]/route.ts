import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadDeck } from "@/lib/decks";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deck = await loadDeck(Number(id));
  if (!deck) return NextResponse.json({ error: "deck not found" }, { status: 404 });
  return NextResponse.json(deck);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, description } = (await req.json()) as {
    name?: string;
    description?: string;
  };
  const db = getDb();
  const existing = db.prepare("SELECT id FROM decks WHERE id = ?").get(Number(id));
  if (!existing) return NextResponse.json({ error: "deck not found" }, { status: 404 });
  db.prepare(
    "UPDATE decks SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?"
  ).run(name?.trim() || null, description?.trim() ?? null, Date.now(), Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM deck_cards WHERE deck_id = ?").run(Number(id));
  db.prepare("DELETE FROM decks WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
