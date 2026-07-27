"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CardTile from "@/components/CardTile";
import CardModal from "@/components/CardModal";
import MetaDecks from "@/components/MetaDecks";
import type { CardSummary } from "@/lib/types";

const SUGGESTIONS = ["ST01", "OP16", "Luffy", "Zoro", "Nami"];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [matchedSet, setMatchedSet] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    const mySeq = ++seq.current;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (mySeq !== seq.current) return;
      setCards(data.cards ?? []);
      setMatchedSet(data.matchedSet ?? null);
    } catch {
      if (mySeq === seq.current) setCards([]);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-2xl pt-10 pb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Search cards, build your <span className="text-accent">deck</span>
        </h1>
        <p className="mt-3 text-sm text-muted">
          Enter a card name, set code (e.g. ST01, OP16) or card code (e.g.
          OP16-001) to check prices, grow your collection, and build decks.
        </p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any card…"
              className="w-full rounded-xl border border-edge bg-surface px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent-dim"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-edge bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
              ⌘K
            </kbd>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-muted">Try:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                runSearch(s);
              }}
              className="rounded-full border border-edge bg-surface px-3 py-1 text-muted transition-colors hover:border-accent-dim hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {searched && (
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-lg font-medium">
              {matchedSet ? (
                <>
                  Set <span className="text-accent">{matchedSet.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted">
                    {matchedSet.id.toUpperCase()}
                  </span>
                </>
              ) : (
                "Results"
              )}
            </h2>
            {!loading && (
              <span className="text-xs text-muted">{cards.length} cards</span>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[63/98] animate-pulse rounded-xl border border-edge bg-surface"
                />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              No results. Try another card name or set code.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {cards.map((c) => (
                <CardTile key={c.id} card={c} onOpen={setOpenCardId} />
              ))}
            </div>
          )}
        </section>
      )}

      <MetaDecks />

      {openCardId && (
        <CardModal id={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
