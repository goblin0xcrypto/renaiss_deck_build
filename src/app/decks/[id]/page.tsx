"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import CardModal from "@/components/CardModal";
import { fmtUsd } from "@/lib/format";
import type { CardSummary, CheckoutPlan, DeckDetail } from "@/lib/types";

/* eslint-disable @next/next/no-img-element */

const DECK_SIZE = 60;
const MAX_COPIES = 4;

export default function DeckBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  const [plan, setPlan] = useState<CheckoutPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/decks/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    setDeck(await res.json());
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const runSearch = async () => {
    const term = query.trim();
    if (!term) return;
    const mySeq = ++seq.current;
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (mySeq === seq.current) setResults(data.cards ?? []);
    } finally {
      if (mySeq === seq.current) setSearching(false);
    }
  };

  const setQty = async (cardId: string, next: { qty?: number; delta?: number }) => {
    await fetch(`/api/decks/${id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, ...next }),
    });
    await reload();
  };

  const rename = async () => {
    if (!deck) return;
    const name = prompt("Deck name", deck.name);
    if (!name?.trim()) return;
    await fetch(`/api/decks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await reload();
  };

  const openCheckout = async () => {
    setOrdered(false);
    const res = await fetch(`/api/decks/${id}/checkout`, { method: "POST" });
    setPlan(await res.json());
    setPlanOpen(true);
  };

  if (notFound) {
    return (
      <p className="py-20 text-center text-muted">
        Deck not found.{" "}
        <Link href="/decks" className="text-accent">
          Back to decks
        </Link>
      </p>
    );
  }
  if (!deck) {
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;
  }

  const overCopies = deck.cards.filter((e) => e.qty > MAX_COPIES);
  const missingCount = deck.cards.reduce(
    (s, e) => s + Math.max(0, e.qty - e.ownedQty),
    0
  );

  return (
    <div className="fade-up">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/decks" className="text-sm text-muted hover:text-ink">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold">{deck.name}</h1>
        <button
          onClick={rename}
          className="rounded-lg border border-edge px-2.5 py-1 text-xs text-muted hover:border-accent-dim hover:text-ink"
        >
          Rename
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded-lg border border-edge bg-surface px-3 py-1.5 font-mono ${
              deck.cardCount === DECK_SIZE ? "text-up" : ""
            }`}
          >
            {deck.cardCount}/{DECK_SIZE}
          </span>
          <span className="rounded-lg border border-edge bg-surface px-3 py-1.5">
            Value{" "}
            <span className="font-mono text-accent">{fmtUsd(deck.totalValueUsd)}</span>
          </span>
          <a
            href={`/api/decks/${id}/export?format=txt`}
            className="rounded-lg border border-edge bg-surface px-3 py-1.5 hover:border-accent-dim"
          >
            Export TXT
          </a>
          <a
            href={`/api/decks/${id}/export?format=json`}
            className="rounded-lg border border-edge bg-surface px-3 py-1.5 hover:border-accent-dim"
          >
            Export JSON
          </a>
          <button
            onClick={openCheckout}
            className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black hover:opacity-90"
          >
            Buy missing cards{missingCount > 0 ? ` (${missingCount})` : ""}
          </button>
        </div>
      </div>

      {deck.description && (
        <p className="mb-4 -mt-4 text-xs text-muted">{deck.description}</p>
      )}

      {overCopies.length > 0 && (
        <div className="mb-4 rounded-lg border border-down/40 bg-down/10 px-4 py-2 text-sm text-down">
          Over the {MAX_COPIES}-copy limit:{" "}
          {overCopies.map((e) => e.card.name).join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Search panel */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <h2 className="text-sm font-medium text-muted">Search cards to add</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Card name or set code…"
              className="min-w-0 flex-1 rounded-lg border border-edge bg-elevated px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent-dim"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg bg-accent px-4 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
            >
              Go
            </button>
          </form>
          <div className="mt-3 max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {searching ? (
              <p className="py-8 text-center text-xs text-muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">
                Search results will appear here
              </p>
            ) : (
              results.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg border border-transparent p-1.5 hover:border-edge hover:bg-elevated"
                >
                  {c.image ? (
                    <img
                      src={c.image}
                      alt=""
                      className="h-12 w-9 rounded object-cover bg-elevated"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-9 rounded bg-elevated" />
                  )}
                  <button
                    onClick={() => setOpenCardId(c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {(c.setId ?? c.id.split("-")[0]).toUpperCase()} #{c.localId}
                    </div>
                  </button>
                  <button
                    onClick={() => setQty(c.id, { delta: 1 })}
                    className="h-7 w-7 shrink-0 rounded-lg bg-accent text-sm font-bold text-black hover:opacity-90"
                    title="Add to deck"
                  >
                    +
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deck list */}
        <div>
          {deck.cards.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-edge text-sm text-muted">
              Search on the left and press &ldquo;+&rdquo; to add cards
            </div>
          ) : (
            <div className="space-y-1.5">
              {deck.cards.map((e) => (
                <div
                  key={e.card.id}
                  className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-2.5"
                >
                  {e.card.image ? (
                    <img
                      src={e.card.image}
                      alt=""
                      className="h-14 w-10 rounded object-cover bg-elevated"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-14 w-10 rounded bg-elevated" />
                  )}
                  <button
                    onClick={() => setOpenCardId(e.card.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-medium">{e.card.name}</div>
                    <div className="truncate text-xs text-muted">
                      {e.card.setName} #{e.card.localId} ·{" "}
                      <span className="font-mono">{fmtUsd(e.card.pricing.usd)}</span>
                    </div>
                  </button>
                  {e.ownedQty >= e.qty ? (
                    <span className="rounded-full border border-up/40 bg-up/10 px-2 py-0.5 text-[11px] text-up">
                      Owned
                    </span>
                  ) : (
                    <span className="rounded-full border border-edge bg-elevated px-2 py-0.5 text-[11px] text-muted">
                      Need {e.qty - e.ownedQty}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQty(e.card.id, { delta: -1 })}
                      className="h-7 w-7 rounded bg-elevated text-sm hover:text-accent"
                    >
                      −
                    </button>
                    <span
                      className={`w-6 text-center font-mono text-sm ${
                        e.qty > MAX_COPIES ? "text-down" : ""
                      }`}
                    >
                      {e.qty}
                    </span>
                    <button
                      onClick={() => setQty(e.card.id, { delta: 1 })}
                      className="h-7 w-7 rounded bg-elevated text-sm hover:text-accent"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-20 text-right font-mono text-sm text-accent">
                    {fmtUsd(e.lineValueUsd)}
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-6 px-3 pt-3 text-sm">
                <span className="text-muted">
                  {deck.cardCount} cards · {deck.cards.length} unique
                </span>
                <span>
                  Total{" "}
                  <span className="font-mono text-lg text-accent">
                    {fmtUsd(deck.totalValueUsd)}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shop OS checkout modal */}
      {planOpen && plan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPlanOpen(false)}
        >
          <div
            className="fade-up max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-edge bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Shop OS Checkout{" "}
                <span className="text-muted text-sm">· missing cards</span>
              </h2>
              <button
                onClick={() => setPlanOpen(false)}
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            {plan.missing.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                🎉 You already own every card in this deck — nothing to buy.
              </p>
            ) : ordered ? (
              <div className="py-10 text-center">
                <div className="text-3xl">✓</div>
                <p className="mt-2 font-medium">Added to Shop OS cart</p>
                <p className="mt-1 text-sm text-muted">
                  Shipped from {plan.shops.length} shops, merged delivery · Total{" "}
                  <span className="font-mono text-accent">
                    {fmtUsd(plan.grandTotalUsd)}
                  </span>
                </p>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">
                  Missing {plan.missing.reduce((s, m) => s + m.needed, 0)} cards,
                  automatically allocated across {plan.shops.length} shops with
                  merged shipping.
                </p>
                <div className="mt-4 space-y-3">
                  {plan.shops.map((s) => (
                    <div key={s.shop} className="rounded-xl border border-edge p-3">
                      <div className="flex items-baseline justify-between">
                        <div className="text-sm font-medium">
                          {s.shop}{" "}
                          <span className="text-xs text-muted">{s.location}</span>
                        </div>
                        <div className="font-mono text-sm">{fmtUsd(s.subtotalUsd)}</div>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {s.items.map((it) => (
                          <li key={it.cardId} className="flex justify-between">
                            <span className="truncate">
                              {it.name} × {it.qty}
                            </span>
                            <span className="ml-3 font-mono shrink-0">
                              {fmtUsd((it.unitUsd ?? 0) * it.qty)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 border-t border-edge pt-3 text-sm">
                  <div className="flex justify-between text-muted">
                    <span>Items subtotal</span>
                    <span className="font-mono">{fmtUsd(plan.itemsTotalUsd)}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>
                      Merged shipping
                      {plan.shops.length > 1 && (
                        <span className="ml-1 text-xs line-through opacity-60">
                          {fmtUsd(plan.shippingTotalUsd)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono">{fmtUsd(plan.mergedShippingUsd)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-base font-medium">
                    <span>Total</span>
                    <span className="font-mono text-accent">
                      {fmtUsd(plan.grandTotalUsd)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setOrdered(true)}
                  className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-black hover:opacity-90"
                >
                  Add all to Shop OS cart
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {openCardId && (
        <CardModal id={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
