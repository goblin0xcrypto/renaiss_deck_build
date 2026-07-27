"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CardModal from "@/components/CardModal";
import { fmtUsd } from "@/lib/format";
import { renderDeckPoster } from "@/lib/deckImage";

/* eslint-disable @next/next/no-img-element */

interface Archetype {
  leaderCode: string;
  name: string;
  count: number;
  sharePct: number;
  bestPlacing: number | null;
  leaderImage: string | null;
  leaderCardId: string | null;
}

interface Meta {
  archetypes: Archetype[];
  sampleSize: number;
  tournamentsScanned: number;
  updatedAt: number;
}

interface DeckCard {
  code: string;
  name: string;
  count: number;
  group: string;
  cardId: string | null;
  image: string | null;
  unitUsd: number | null;
  lineUsd: number | null;
  cost: number | null;
  counterValue: number | null;
}

interface MetaDeck {
  leaderCode: string;
  name: string;
  sharePct: number;
  count: number;
  tournament: string | null;
  cards: DeckCard[];
  cardCount: number;
  totalUsd: number;
  pricedCards: number;
  sim: string;
}

export default function MetaDecks() {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Archetype | null>(null);
  const [deck, setDeck] = useState<MetaDeck | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterError, setPosterError] = useState(false);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // let the stacked card modal (if any) handle its own Escape first
      if (e.key === "Escape" && !openCardId) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openCardId]);

  const openModal = async (a: Archetype) => {
    setOpen(a);
    setDeck(null);
    setCopied(false);
    setPosterUrl(null);
    setPosterError(false);
    try {
      const res = await fetch(
        `/api/meta/deck?leader=${encodeURIComponent(a.leaderCode)}`
      );
      if (!res.ok) return;
      const d: MetaDeck = await res.json();
      setDeck(d);
      try {
        const url = await renderDeckPoster({
          title: `〔${a.leaderCode.split("-")[0]}〕${a.name}`,
          subtitle: `${a.sharePct}% meta share · ${a.count} decks`,
          bannerImage: a.leaderImage,
          leaderCode: a.leaderCode,
          cards: d.cards,
          importUrl: `${window.location.origin}/api/meta/import?leader=${encodeURIComponent(
            a.leaderCode
          )}`,
        });
        setPosterUrl(url);
      } catch {
        setPosterError(true);
      }
    } catch {
      /* modal shows loading failure state */
    }
  };

  const saveImage = () => {
    if (!posterUrl || !open) return;
    const a = document.createElement("a");
    a.href = posterUrl;
    a.download = `${open.leaderCode}-${open.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    a.click();
  };

  const copySim = async () => {
    if (!deck) return;
    await navigator.clipboard.writeText(deck.sim);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const importDeck = async () => {
    if (!deck || importing) return;
    setImporting(true);
    try {
      const res = await fetch("/api/meta/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leader: deck.leaderCode }),
      });
      if (res.ok) {
        const { deckId } = await res.json();
        router.push(`/decks/${deckId}`);
        return;
      }
    } catch {
      /* fall through */
    }
    setImporting(false);
  };

  if (failed) return null; // meta is a bonus section — hide quietly if the source is down

  // Cards Limitless's decklist references that our catalog hasn't synced yet
  // (e.g. a brand-new starter deck) can't be added to a real deck — there's
  // no local card row to point at — so they're dropped on import. Surface
  // that up front instead of letting "51 cards" quietly become "35".
  const missingCards = deck?.cards.filter((c) => !c.cardId) ?? [];
  const missingCopies = missingCards.reduce((s, c) => s + c.count, 0);

  return (
    <section className="mt-4">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-medium">
          Meta Decks <span className="text-accent">· One Piece</span>
        </h2>
        {meta && (
          <span className="text-xs text-muted">
            {meta.sampleSize} decks across {meta.tournamentsScanned} recent
            tournaments · via Limitless
          </span>
        )}
      </div>

      {!meta ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[5/3] animate-pulse rounded-xl border border-edge bg-surface"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {meta.archetypes.map((a) => (
            <button
              key={a.leaderCode}
              onClick={() => openModal(a)}
              className="group relative aspect-[5/3] overflow-hidden rounded-xl border border-edge bg-surface text-left transition-all duration-200 hover:-translate-y-1.5 hover:border-accent-dim hover:shadow-xl hover:shadow-black/50"
            >
              {a.leaderImage ? (
                <img
                  src={a.leaderImage}
                  alt={a.name}
                  loading="lazy"
                  className="h-full w-full scale-[1.45] object-cover object-[50%_18%] transition-transform duration-300 group-hover:scale-[1.6]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  {a.name}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-8">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <span className="font-mono text-accent">{a.sharePct}%</span>
                  <span className="text-muted">{a.count} decks</span>
                  <span className="ml-auto font-mono text-[10px] text-muted">
                    {a.leaderCode}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Deck modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="fade-up max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-edge bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 border-b border-edge p-5">
              {open.leaderImage && (
                <img
                  src={open.leaderImage}
                  alt={open.name}
                  className="w-24 shrink-0 rounded-lg border border-edge"
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">{open.name}</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Leader{" "}
                  {open.leaderCardId ? (
                    <button
                      onClick={() => setOpenCardId(open.leaderCardId)}
                      className="font-mono text-accent hover:underline"
                    >
                      {open.leaderCode}
                    </button>
                  ) : (
                    <span className="font-mono">{open.leaderCode}</span>
                  )}{" "}
                  · meta share{" "}
                  <span className="font-mono text-accent">{open.sharePct}%</span> ·{" "}
                  {open.count} decks
                </p>
                {deck?.tournament && (
                  <p className="mt-1 truncate text-xs text-muted">
                    Sample list from: {deck.tournament}
                  </p>
                )}
                {deck && missingCopies > 0 && (
                  <p className="mt-1 text-xs text-accent">
                    {`⚠ ${missingCopies} of ${deck.cardCount} cards aren't in the catalog yet (${missingCards
                      .map((c) => c.code)
                      .join(", ")}) — they'll be left out when you import this deck.`}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={copySim}
                    disabled={!deck}
                    className="rounded-lg border border-edge bg-elevated px-3 py-1.5 text-xs hover:border-accent-dim disabled:opacity-50"
                  >
                    {copied ? "✓ Copied" : "Copy SIM"}
                  </button>
                  <button
                    onClick={importDeck}
                    disabled={!deck || importing}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {importing ? "Importing…" : "Open in Deck Builder"}
                  </button>
                  <button
                    onClick={saveImage}
                    disabled={!posterUrl}
                    className="rounded-lg border border-edge bg-elevated px-3 py-1.5 text-xs hover:border-accent-dim disabled:opacity-50"
                  >
                    💾 Save Image
                  </button>
                  {deck && (
                    <span className="ml-auto text-sm">
                      <span className="text-muted">Total </span>
                      <span className="font-mono text-accent">
                        {fmtUsd(deck.totalUsd)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              {!deck ? (
                <p className="py-10 text-center text-sm text-muted">
                  Loading decklist…
                </p>
              ) : posterError ? (
                <p className="py-10 text-center text-sm text-muted">
                  Couldn&apos;t render the deck poster. Try reopening this deck.
                </p>
              ) : posterUrl ? (
                <img
                  src={posterUrl}
                  alt={`${open.name} deck poster`}
                  className="w-full rounded-xl border border-edge"
                />
              ) : (
                <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-elevated" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card modal — same viewer as search results, stacked over the deck modal */}
      {openCardId && (
        <CardModal id={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </section>
  );
}
