import { kvGet, kvSet } from "./db";
import { getOnePieceCardByCode } from "./optcg";

const API = "https://play.limitlesstcg.com/api";
const META_TTL_MS = 1000 * 60 * 60 * 6;
const TOURNAMENTS_TO_SCAN = 15;
const MIN_PLAYERS = 8;
const TOP_ARCHETYPES = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RawDeckEntry {
  count: number;
  name: string;
  set: string;
  number: string;
}

export interface RawDecklist {
  leader: { name: string; set: string; number: string };
  character?: RawDeckEntry[];
  event?: RawDeckEntry[];
  stage?: RawDeckEntry[];
}

export interface MetaArchetype {
  leaderCode: string; // e.g. "OP07-019"
  name: string;
  count: number;
  sharePct: number;
  bestPlacing: number | null;
  tournament: string | null; // where the representative decklist placed
  decklist: RawDecklist | null;
  leaderImage: string | null;
  leaderCardId: string | null;
}

export interface MetaSnapshot {
  archetypes: MetaArchetype[];
  sampleSize: number; // players with a classified deck
  tournamentsScanned: number;
  updatedAt: number;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function buildMeta(): Promise<MetaSnapshot | null> {
  const tournaments = await fetchJson(`${API}/tournaments?game=OP&limit=50`);
  if (!Array.isArray(tournaments)) return null;
  const picked = tournaments
    .filter((t: any) => (t.players ?? 0) >= MIN_PLAYERS)
    .slice(0, TOURNAMENTS_TO_SCAN);

  interface Bucket {
    leaderCode: string;
    name: string;
    count: number;
    bestPlacing: number | null;
    tournament: string | null;
    decklist: RawDecklist | null;
    decklistPlacing: number;
  }
  const buckets = new Map<string, Bucket>();
  let sampleSize = 0;
  let scanned = 0;

  for (const t of picked) {
    const standings = await fetchJson(`${API}/tournaments/${t.id}/standings`);
    if (!Array.isArray(standings)) continue;
    scanned++;
    for (const e of standings) {
      const d = e?.deck;
      if (!d?.id || !d?.name) continue;
      sampleSize++;
      const key = String(d.id).toUpperCase();
      let b = buckets.get(key);
      if (!b) {
        b = {
          leaderCode: key,
          name: d.name,
          count: 0,
          bestPlacing: null,
          tournament: null,
          decklist: null,
          decklistPlacing: Infinity,
        };
        buckets.set(key, b);
      }
      b.count++;
      const placing = typeof e.placing === "number" ? e.placing : null;
      if (placing !== null && (b.bestPlacing === null || placing < b.bestPlacing)) {
        b.bestPlacing = placing;
      }
      // Representative decklist = the best-placed list we have seen
      if (e.decklist?.leader && (placing ?? 9999) < b.decklistPlacing) {
        b.decklist = e.decklist as RawDecklist;
        b.decklistPlacing = placing ?? 9999;
        b.tournament = t.name ?? null;
      }
    }
  }
  if (sampleSize === 0) return null;

  const top = [...buckets.values()]
    .filter((b) => b.decklist) // only recommend archetypes we can actually show
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_ARCHETYPES);

  const archetypes: MetaArchetype[] = await Promise.all(
    top.map(async (b) => {
      const leader = await getOnePieceCardByCode(b.leaderCode).catch(() => null);
      return {
        leaderCode: b.leaderCode,
        name: b.name,
        count: b.count,
        sharePct: Math.round((b.count / sampleSize) * 1000) / 10,
        bestPlacing: b.bestPlacing,
        tournament: b.tournament,
        decklist: b.decklist,
        leaderImage: leader?.imageLarge ?? leader?.image ?? null,
        leaderCardId: leader?.id ?? null,
      };
    })
  );

  return {
    archetypes,
    sampleSize,
    tournamentsScanned: scanned,
    updatedAt: Date.now(),
  };
}

export async function getOnePieceMeta(): Promise<MetaSnapshot | null> {
  const cached = kvGet<MetaSnapshot>("op-meta", META_TTL_MS);
  if (cached && !cached.stale) return cached.value;
  const fresh = await buildMeta();
  if (fresh) {
    kvSet("op-meta", fresh);
    return fresh;
  }
  return cached?.value ?? null; // stale is better than nothing
}

export function decklistEntries(
  dl: RawDecklist
): { code: string; count: number; group: "leader" | "character" | "event" | "stage"; name: string }[] {
  const code = (e: { set: string; number: string }) => `${e.set}-${e.number}`;
  return [
    { code: code(dl.leader), count: 1, group: "leader" as const, name: dl.leader.name },
    ...(dl.character ?? []).map((e) => ({
      code: code(e),
      count: e.count,
      group: "character" as const,
      name: e.name,
    })),
    ...(dl.event ?? []).map((e) => ({
      code: code(e),
      count: e.count,
      group: "event" as const,
      name: e.name,
    })),
    ...(dl.stage ?? []).map((e) => ({
      code: code(e),
      count: e.count,
      group: "stage" as const,
      name: e.name,
    })),
  ];
}
