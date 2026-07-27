import { NextRequest, NextResponse } from "next/server";
import { loadDeck } from "@/lib/decks";
import type { CheckoutPlan, ShopAllocation } from "@/lib/types";

// Simulated Shop OS partner network. In production this would query live
// inventory; here allocation is deterministic by card id hash so the same
// deck always produces the same fulfilment plan.
const SHOPS = [
  { shop: "Renaiss Flagship", location: "Hong Kong · Central", shippingUsd: 4 },
  { shop: "Card Lab", location: "Hong Kong · Tsim Sha Tsui", shippingUsd: 3.5 },
  { shop: "PokeVault", location: "Hong Kong · Mong Kok", shippingUsd: 3 },
];
const MERGED_SHIPPING_USD = 5;

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deck = await loadDeck(Number(id));
  if (!deck) return NextResponse.json({ error: "deck not found" }, { status: 404 });

  const missing = deck.cards
    .filter((e) => e.qty > e.ownedQty)
    .map((e) => ({
      cardId: e.card.id,
      name: e.card.name,
      needed: e.qty - e.ownedQty,
      owned: e.ownedQty,
      unitUsd: e.card.pricing.usd,
    }));

  const shops: ShopAllocation[] = SHOPS.map((s) => ({
    shop: s.shop,
    location: s.location,
    items: [],
    subtotalUsd: 0,
    shippingUsd: s.shippingUsd,
  }));
  for (const m of missing) {
    const shop = shops[hashCode(m.cardId) % shops.length];
    shop.items.push({
      cardId: m.cardId,
      name: m.name,
      qty: m.needed,
      unitUsd: m.unitUsd,
    });
    shop.subtotalUsd += (m.unitUsd ?? 0) * m.needed;
  }
  const activeShops = shops.filter((s) => s.items.length > 0);
  const itemsTotalUsd = activeShops.reduce((s, x) => s + x.subtotalUsd, 0);
  const shippingTotalUsd = activeShops.reduce((s, x) => s + x.shippingUsd, 0);
  const mergedShippingUsd = activeShops.length > 1 ? MERGED_SHIPPING_USD : shippingTotalUsd;

  const plan: CheckoutPlan = {
    deckId: deck.id,
    missing: missing.map(({ cardId, name, needed, owned }) => ({
      cardId,
      name,
      needed,
      owned,
    })),
    shops: activeShops,
    itemsTotalUsd,
    shippingTotalUsd,
    mergedShippingUsd,
    grandTotalUsd: itemsTotalUsd + mergedShippingUsd,
  };
  return NextResponse.json(plan);
}
