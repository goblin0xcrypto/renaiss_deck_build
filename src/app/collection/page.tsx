"use client";

import { useCallback, useEffect, useState } from "react";
import CardModal from "@/components/CardModal";
import CardTile from "@/components/CardTile";
import { fmtUsd } from "@/lib/format";
import type { CardDetail } from "@/lib/types";

interface OwnedItem {
  card: CardDetail | null;
  cardId: string;
  qty: number;
}

export default function CollectionPage() {
  const [tab, setTab] = useState<"owned" | "favorites">("owned");
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [favorites, setFavorites] = useState<CardDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [colRes, favRes] = await Promise.all([
        fetch("/api/collection"),
        fetch("/api/favorites"),
      ]);
      const col = await colRes.json();
      const fav = await favRes.json();
      setOwned(col.items ?? []);
      setTotalValueUsd(col.totalValueUsd ?? 0);
      setFavorites(fav.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setQty = async (cardId: string, qty: number) => {
    await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, qty }),
    });
    await reload();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">My Collection</h1>
        <div className="ml-auto rounded-lg border border-edge bg-surface px-4 py-2 text-sm">
          <span className="text-muted">Collection value </span>
          <span className="font-mono text-accent">{fmtUsd(totalValueUsd)}</span>
        </div>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg border border-edge bg-surface p-1 text-sm w-fit">
        {(
          [
            ["owned", `Owned (${owned.length})`],
            ["favorites", `Favorites (${favorites.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 transition-colors ${
              tab === key ? "bg-elevated text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Loading…</p>
      ) : tab === "owned" ? (
        owned.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            No cards yet. Press &ldquo;Owned +&rdquo; on any card page to add one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {owned.map(
              (it) =>
                it.card && (
                  <CardTile
                    key={it.cardId}
                    card={it.card}
                    onOpen={setOpenCardId}
                    footer={
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-accent">
                          {fmtUsd(it.card.pricing.usd)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => setQty(it.cardId, it.qty - 1)}
                            className="h-6 w-6 rounded bg-elevated hover:text-accent"
                          >
                            −
                          </button>
                          <span className="font-mono">×{it.qty}</span>
                          <button
                            onClick={() => setQty(it.cardId, it.qty + 1)}
                            className="h-6 w-6 rounded bg-elevated hover:text-accent"
                          >
                            +
                          </button>
                        </span>
                      </div>
                    }
                  />
                )
            )}
          </div>
        )
      ) : favorites.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Your favorites list is empty. Press &ldquo;♡ Favorite&rdquo; on any card
          page.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {favorites.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              onOpen={setOpenCardId}
              footer={
                <div className="text-xs font-mono text-accent">
                  {fmtUsd(c.pricing.usd)}
                </div>
              }
            />
          ))}
        </div>
      )}

      {openCardId && (
        <CardModal id={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
