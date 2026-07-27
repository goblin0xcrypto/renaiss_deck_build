"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmtUsd } from "@/lib/format";
import type { DeckSummary } from "@/lib/types";

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await fetch("/api/decks");
    const data = await res.json();
    setDecks(data.decks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    await reload();
  };

  const remove = async (id: number, deckName: string) => {
    if (!confirm(`Delete deck "${deckName}"?`)) return;
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">My Decks</h1>

      <form onSubmit={create} className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New deck name (e.g. Gengar Control)"
          className="flex-1 rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent-dim"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-5 text-sm font-medium text-black hover:opacity-90"
        >
          Create
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading…</p>
        ) : decks.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            No decks yet — create your first one.
          </p>
        ) : (
          decks.map((d) => (
            <div
              key={d.id}
              className="fade-up flex items-center gap-4 rounded-xl border border-edge bg-surface p-4 transition-colors hover:border-accent-dim"
            >
              <Link href={`/decks/${d.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {d.cardCount} cards · updated{" "}
                  {new Date(d.updatedAt).toLocaleDateString("en-US")}
                </div>
              </Link>
              <div className="font-mono text-sm text-accent">
                {fmtUsd(d.totalValueUsd)}
              </div>
              <Link
                href={`/decks/${d.id}`}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent-dim hover:text-ink"
              >
                Edit
              </Link>
              <button
                onClick={() => remove(d.id, d.name)}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:border-down hover:text-down"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
