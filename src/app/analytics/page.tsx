"use client";

import { useEffect, useState } from "react";
import CardModal from "@/components/CardModal";
import { fmtUsd } from "@/lib/format";

/* eslint-disable @next/next/no-img-element */

interface StatRow {
  card_id: string;
  name: string | null;
  image: string | null;
  set_name: string | null;
  local_id: string | null;
  price_usd: number | null;
  searches: number;
  views: number;
  favorites: number;
  owners: number;
  watch_up: number;
  watch_down: number;
}

interface Analytics {
  topSearched: StatRow[];
  topFavorited: StatRow[];
  topOwned: StatRow[];
  sentiment: StatRow[];
  topTerms: { term: string; count: number }[];
}

function CardRow({
  row,
  metric,
  onOpen,
}: {
  row: StatRow;
  metric: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(row.card_id)}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-elevated"
    >
      {row.image ? (
        <img
          src={row.image}
          alt=""
          className="h-11 w-8 rounded object-cover bg-elevated"
          loading="lazy"
        />
      ) : (
        <div className="h-11 w-8 rounded bg-elevated" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{row.name ?? row.card_id}</div>
        <div className="truncate text-xs text-muted">
          {row.set_name} #{row.local_id} ·{" "}
          <span className="font-mono">{fmtUsd(row.price_usd)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-sm">{metric}</div>
    </button>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <div className="mt-3 space-y-0.5">{children}</div>
    </section>
  );
}

const EMPTY = <p className="py-8 text-center text-xs text-muted">No data yet</p>;

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold">Market Analytics</h1>
      <p className="mt-1 text-sm text-muted">
        Favorites, ownership, search heat and price sentiment — a source for push
        notifications and market data.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Top Searched" hint="times surfaced in search results">
          {data.topSearched.length === 0
            ? EMPTY
            : data.topSearched.map((r) => (
                <CardRow
                  key={r.card_id}
                  row={r}
                  onOpen={setOpenCardId}
                  metric={<span className="font-mono">{r.searches}</span>}
                />
              ))}
        </Panel>

        <Panel title="Price Sentiment" hint="bullish / bearish votes">
          {data.sentiment.length === 0
            ? EMPTY
            : data.sentiment.map((r) => (
                <CardRow
                  key={r.card_id}
                  row={r}
                  onOpen={setOpenCardId}
                  metric={
                    <span className="font-mono text-xs">
                      <span className="text-up">▲{r.watch_up}</span>{" "}
                      <span className="text-down">▼{r.watch_down}</span>
                    </span>
                  }
                />
              ))}
        </Panel>

        <Panel title="Most Favorited" hint="favorites">
          {data.topFavorited.length === 0
            ? EMPTY
            : data.topFavorited.map((r) => (
                <CardRow
                  key={r.card_id}
                  row={r}
                  onOpen={setOpenCardId}
                  metric={<span className="font-mono">♥ {r.favorites}</span>}
                />
              ))}
        </Panel>

        <Panel title="Most Owned" hint="owners">
          {data.topOwned.length === 0
            ? EMPTY
            : data.topOwned.map((r) => (
                <CardRow
                  key={r.card_id}
                  row={r}
                  onOpen={setOpenCardId}
                  metric={<span className="font-mono">{r.owners}</span>}
                />
              ))}
        </Panel>
      </div>

      <section className="mt-4 rounded-xl border border-edge bg-surface p-4">
        <h2 className="font-medium">Top Search Terms</h2>
        {data.topTerms.length === 0 ? (
          EMPTY
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.topTerms.map((t) => (
              <span
                key={t.term}
                className="rounded-full border border-edge bg-elevated px-3 py-1 text-xs"
              >
                {t.term} <span className="font-mono text-muted">×{t.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {openCardId && (
        <CardModal id={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
