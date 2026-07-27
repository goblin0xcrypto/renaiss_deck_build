import { getDb } from "./db";
import { getCards } from "./optcg";
import type { DeckDetail } from "./types";

export async function loadDeck(deckId: number): Promise<DeckDetail | null> {
  const db = getDb();
  const deck = db
    .prepare("SELECT id, name, description FROM decks WHERE id = ?")
    .get(deckId) as { id: number; name: string; description: string } | undefined;
  if (!deck) return null;

  const rows = db
    .prepare("SELECT card_id, qty FROM deck_cards WHERE deck_id = ? AND qty > 0")
    .all(deckId) as { card_id: string; qty: number }[];
  const cards = await getCards(rows.map((r) => r.card_id));
  const owned = new Map(
    (db.prepare("SELECT card_id, qty FROM collection").all() as {
      card_id: string;
      qty: number;
    }[]).map((r) => [r.card_id, r.qty])
  );

  const entries = rows
    .map((r) => {
      const card = cards.get(r.card_id);
      if (!card) return null;
      return {
        card,
        qty: r.qty,
        lineValueUsd: (card.pricing.usd ?? 0) * r.qty,
        ownedQty: owned.get(r.card_id) ?? 0,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.card.name.localeCompare(b.card.name));

  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    cards: entries,
    cardCount: entries.reduce((s, e) => s + e.qty, 0),
    totalValueUsd: entries.reduce((s, e) => s + e.lineValueUsd, 0),
  };
}
