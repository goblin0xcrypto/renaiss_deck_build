"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtUsd } from "@/lib/format";
import type { CardWithState, DeckSummary } from "@/lib/types";

/* eslint-disable @next/next/no-img-element */

interface RenaissDetail {
  tracked: boolean;
  graded?: boolean;
  priceUsd?: number | null;
  gradeLabel?: string;
  variation?: string | null;
  language?: string | null;
  deltas?: { d7: number | null; d30: number | null; d365: number | null };
  confidence?: string | null;
  sourceCount?: number | null;
  observationCount?: number | null;
  lastSaleAt?: string | null;
  otherGrades?: {
    gradeLabel: string;
    usd: number | null;
    deltaPct: number | null;
    confidence: string | null;
    current: boolean;
  }[];
  series?: { t: string; usd: number }[];
  windowDays?: number | null;
  pageUrl?: string;
}

function fmtDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function DeltaBadge({ label, value }: { label: string; value: number | null }) {
  const cls =
    value == null ? "text-muted" : value >= 0 ? "text-up" : "text-down";
  return (
    <span className="rounded-md bg-elevated px-2 py-1 text-xs">
      <span className="text-muted">{label} </span>
      <span className={`font-mono ${cls}`}>
        {value == null ? "—" : `${value >= 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(2)}%`}
      </span>
    </span>
  );
}

const CONFIDENCE_STYLE: Record<string, string> = {
  prime: "border-up/50 text-up",
  high: "border-up/40 text-up",
  medium: "border-accent-dim text-accent",
  low: "border-edge text-muted",
};

function ConfidenceBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        CONFIDENCE_STYLE[tier] ?? "border-edge text-muted"
      }`}
    >
      {tier} confidence
    </span>
  );
}

/** Compact FMV line chart (single series — accent line, crosshair + tooltip). */
function PriceChart({ points }: { points: { t: string; usd: number }[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 120;
  const PAD = 8;

  const vals = points.map((p) => p.usd);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || max || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.usd)}`).join("");
  const area = `${line}L${x(points.length - 1)},${H}L${x(0)},${H}Z`;

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover != null ? points[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="relative mt-3"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {hp && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-edge bg-elevated px-2 py-1 text-[11px] shadow-lg"
          style={{ left: `${(x(hover!) / W) * 100}%` }}
        >
          <span className="text-muted">{fmtDate(hp.t)} </span>
          <span className="font-mono">{fmtUsd(hp.usd)}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
      >
        <defs>
          <linearGradient id="fmv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke="var(--color-edge)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="url(#fmv-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD}
            y2={H - PAD}
            stroke="var(--color-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle
          cx={x(hover ?? points.length - 1)}
          cy={y((hp ?? points[points.length - 1]).usd)}
          r="3.5"
          fill="var(--color-accent)"
          stroke="var(--color-surface)"
          strokeWidth="2"
        />
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-muted">
        <span>{fmtDate(points[0].t)}</span>
        <span>
          {fmtUsd(min)} – {fmtUsd(max)}
        </span>
        <span>{fmtDate(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}

export default function CardDetailView({ id }: { id: string }) {
  const [data, setData] = useState<CardWithState | null>(null);
  const [renaiss, setRenaiss] = useState<RenaissDetail | null>(null);
  const [gradesOpen, setGradesOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/cards/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    setData(await res.json());
    // after the card loads (which primes the Renaiss price cache), pull the
    // rich index detail: deltas, chart series, grade ladder
    fetch(`/api/cards/${id}/renaiss`)
      .then((r) => (r.ok ? r.json() : { tracked: false }))
      .then(setRenaiss)
      .catch(() => setRenaiss({ tracked: false }));
  }, [id]);

  useEffect(() => {
    setData(null);
    setRenaiss(null);
    setGradesOpen(false);
    setNotFound(false);
    reload();
    fetch("/api/decks")
      .then((r) => r.json())
      .then((d) => setDecks(d.decks ?? []))
      .catch(() => {});
  }, [reload]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const act = async (action: string) => {
    await fetch(`/api/cards/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await reload();
  };

  const setCollectionQty = async (qty: number) => {
    await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: id, qty }),
    });
    await reload();
  };

  const addToDeck = async (deckId: number) => {
    await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: id, delta: 1 }),
    });
    const deck = decks.find((d) => d.id === deckId);
    flash(`Added to deck "${deck?.name ?? deckId}"`);
  };

  if (notFound) {
    return <p className="py-20 text-center text-muted">Card not found.</p>;
  }
  if (!data) {
    return (
      <div className="grid gap-8 py-8 md:grid-cols-[380px_1fr]">
        <div className="aspect-[63/88] animate-pulse rounded-2xl bg-elevated" />
        <div className="space-y-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-elevated" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-elevated" />
          <div className="h-40 animate-pulse rounded-xl bg-elevated" />
        </div>
      </div>
    );
  }

  const { card } = data;

  return (
    <div className="fade-up grid gap-8 md:grid-cols-[380px_1fr]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-accent-dim bg-elevated px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
          {card.imageLarge || card.image ? (
            <img
              src={card.imageLarge ?? card.image ?? undefined}
              alt={card.name}
              className="w-full"
            />
          ) : (
            <div className="flex aspect-[63/88] items-center justify-center text-muted">
              No image
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
            {card.rarity && (
              <span className="rounded-full border border-edge bg-surface px-2.5 py-0.5 text-xs text-muted">
                {card.rarity}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {card.setName} · {card.localId}
          </p>
        </div>

        {card.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {card.description}
          </p>
        )}

        {/* Prices — Renaiss OS Index panel + TCGPlayer side by side */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Renaiss OS Index
            </span>
            {renaiss?.tracked && (
              <>
                <ConfidenceBadge tier={renaiss.confidence} />
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    renaiss.graded
                      ? "border-accent-dim text-accent"
                      : "border-edge text-muted"
                  }`}
                >
                  {renaiss.gradeLabel ?? card.pricing.gradeLabel ?? "Raw"}
                  {renaiss.language ? ` · ${renaiss.language}` : ""}
                </span>
              </>
            )}
          </div>
          {renaiss?.tracked && renaiss.graded && (
            <p className="mt-1.5 text-[11px] text-muted">
              Graded-market price ({renaiss.gradeLabel}) — reference only; tile
              prices, deck totals and checkout keep using the ungraded market
              price.
            </p>
          )}

          {renaiss == null ? (
            <div className="mt-3 h-24 animate-pulse rounded-lg bg-elevated" />
          ) : renaiss.tracked ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="font-mono text-3xl font-semibold text-accent">
                  {fmtUsd(renaiss.priceUsd ?? card.pricing.usd)}
                </span>
                <DeltaBadge label="7D" value={renaiss.deltas?.d7 ?? null} />
                <DeltaBadge label="30D" value={renaiss.deltas?.d30 ?? null} />
                <DeltaBadge label="1Y" value={renaiss.deltas?.d365 ?? null} />
              </div>

              {(renaiss.series?.length ?? 0) >= 2 && (
                <PriceChart points={renaiss.series!} />
              )}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Last sale {fmtDate(renaiss.lastSaleAt)}</span>
                <span>
                  {renaiss.sourceCount ?? 0} source
                  {(renaiss.sourceCount ?? 0) === 1 ? "" : "s"}
                </span>
                <span>{renaiss.observationCount ?? 0} observations</span>
              </div>

              {(() => {
                const grades = renaiss.otherGrades ?? [];
                if (grades.length <= 1) return null;
                // collapsed: only the default (current) tier; click reveals the rest
                const shown = gradesOpen
                  ? grades
                  : grades.filter((g) => g.current).length > 0
                    ? grades.filter((g) => g.current)
                    : grades.slice(0, 1);
                const hidden = grades.length - shown.length;
                return (
                  <div className="mt-3 overflow-hidden rounded-lg border border-edge">
                    {shown.map((g) => (
                      <div
                        key={g.gradeLabel}
                        className={`flex items-center justify-between border-b border-edge px-3 py-1.5 text-xs last:border-b-0 ${
                          g.current ? "bg-elevated" : ""
                        }`}
                      >
                        <span className={g.current ? "" : "text-muted"}>
                          {g.gradeLabel}
                          {g.current ? " · this card" : ""}
                        </span>
                        <span className="flex items-center gap-3">
                          {g.deltaPct != null && (
                            <span
                              className={`font-mono ${
                                g.deltaPct >= 0 ? "text-up" : "text-down"
                              }`}
                            >
                              {g.deltaPct >= 0 ? "▲" : "▼"}{" "}
                              {Math.abs(g.deltaPct).toFixed(2)}%
                            </span>
                          )}
                          <span className="font-mono">{fmtUsd(g.usd)}</span>
                        </span>
                      </div>
                    ))}
                    <button
                      onClick={() => setGradesOpen((v) => !v)}
                      className="w-full border-t border-edge px-3 py-1.5 text-left text-xs text-muted transition-colors hover:text-accent"
                    >
                      {gradesOpen
                        ? "▴ Show fewer grades"
                        : `▾ Show ${hidden} more grade${hidden === 1 ? "" : "s"}`}
                    </button>
                  </div>
                );
              })()}

              {renaiss.pageUrl && (
                <a
                  href={renaiss.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-accent hover:underline"
                >
                  View on Renaiss OS Index ↗
                </a>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Not tracked on the Renaiss OS Index yet.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-edge bg-surface p-4">
            <div className="text-xs text-muted">TCGPlayer Market</div>
            <div className="mt-1 font-mono text-2xl font-semibold">
              {fmtUsd(card.pricing.tcgUsd)}
            </div>
          </div>
          <div className="rounded-xl border border-edge bg-surface p-4">
            <div className="text-xs text-muted">TCGPlayer Low</div>
            <div className="mt-1 font-mono text-2xl font-semibold">
              {fmtUsd(card.pricing.usdLow)}
            </div>
          </div>
          <div className="col-span-2 rounded-xl border border-edge bg-surface p-4 sm:col-span-1">
            <div className="text-xs text-muted">TCG updated</div>
            <div className="mt-1 text-sm">{card.pricing.tcgUpdated ?? "—"}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => act(data.favorited ? "unfavorite" : "favorite")}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              data.favorited
                ? "border-accent bg-accent/15 text-accent"
                : "border-edge bg-surface hover:border-accent-dim"
            }`}
          >
            {data.favorited ? "♥ Favorited" : "♡ Favorite"}
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-1.5">
            <span className="text-sm text-muted">Owned</span>
            <button
              onClick={() => setCollectionQty(Math.max(0, data.collectionQty - 1))}
              className="h-7 w-7 rounded bg-elevated text-sm hover:text-accent"
            >
              −
            </button>
            <span className="w-6 text-center font-mono text-sm">
              {data.collectionQty}
            </span>
            <button
              onClick={() => setCollectionQty(data.collectionQty + 1)}
              className="h-7 w-7 rounded bg-elevated text-sm hover:text-accent"
            >
              +
            </button>
          </div>

          <div className="relative">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addToDeck(Number(e.target.value));
                  e.target.value = "";
                }
              }}
              className="appearance-none rounded-lg border border-edge bg-surface px-4 py-2 pr-8 text-sm hover:border-accent-dim"
            >
              <option value="" disabled>
                ＋ Add to deck…
              </option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cardCount} cards)
                </option>
              ))}
            </select>
            {decks.length === 0 && (
              <span className="ml-2 text-xs text-muted">
                (Create a deck on the Decks page first)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
