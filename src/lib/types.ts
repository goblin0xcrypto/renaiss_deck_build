export interface CardSummary {
  id: string;
  localId: string;
  name: string;
  image: string | null; // small image URL, usable as-is
  setId?: string;
  setName?: string;
  priceUsd?: number | null; // effective display price (Renaiss preferred)
  priceTcgUsd?: number | null; // TCGPlayer market, always kept for side-by-side
  priceSource?: "renaiss" | "tcgplayer";
}

export interface CardPricing {
  usd: number | null; // effective market price (Renaiss preferred) — drives totals
  usdLow: number | null; // TCGPlayer low
  tcgUsd: number | null; // TCGPlayer market, always kept for side-by-side display
  eur: number | null; // unused (USD-only pricing)
  updated: string | null; // effective source's price date
  tcgUpdated: string | null;
  source?: "renaiss" | "tcgplayer" | null;
  gradeLabel?: string | null; // Renaiss condition tier, e.g. "Raw A"
  confidence?: string | null; // Renaiss confidence tier (prime/high/medium/low)
  renaissHref?: string | null;
}

export interface CardDetail extends CardSummary {
  imageLarge: string | null;
  category: string;
  rarity: string | null;
  illustrator: string | null;
  hp: number | null;
  types: string[];
  description: string | null;
  setLogo: string | null;
  setCardCount: number | null;
  pricing: CardPricing;
  cost: number | null; // numeric cost (null for Leader / uncosted cards)
  counterValue: number | null; // printed counter amount, e.g. 1000/2000
}

export interface CardStats {
  searches: number;
  views: number;
  favorites: number;
  owners: number;
  watchUp: number;
  watchDown: number;
}

export interface CardWithState {
  card: CardDetail;
  stats: CardStats;
  favorited: boolean;
  collectionQty: number;
}

export interface DeckSummary {
  id: number;
  name: string;
  description: string;
  cardCount: number;
  totalValueUsd: number;
  updatedAt: number;
}

export interface DeckCardEntry {
  card: CardDetail;
  qty: number;
  lineValueUsd: number;
  ownedQty: number;
}

export interface DeckDetail {
  id: number;
  name: string;
  description: string;
  cards: DeckCardEntry[];
  cardCount: number;
  totalValueUsd: number;
}

export interface ShopAllocation {
  shop: string;
  location: string;
  items: { cardId: string; name: string; qty: number; unitUsd: number | null }[];
  subtotalUsd: number;
  shippingUsd: number;
}

export interface CheckoutPlan {
  deckId: number;
  missing: { cardId: string; name: string; needed: number; owned: number }[];
  shops: ShopAllocation[];
  itemsTotalUsd: number;
  shippingTotalUsd: number;
  mergedShippingUsd: number;
  grandTotalUsd: number;
}
