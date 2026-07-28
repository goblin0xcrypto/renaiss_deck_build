import { NextRequest, NextResponse } from "next/server";
import { getDb, kvGet, kvSet } from "@/lib/db";
import { renaissApiJson } from "@/lib/renaiss";

/**
 * Rich Renaiss OS Index detail for one of our printings: hero price, deltas,
 * confidence, grade ladder and the daily FMV series for the chart. Resolved
 * via the href cached in `renaiss_prices` (so it 404s cleanly for cards the
 * index doesn't track), cached 24h in kv_cache, stale served on failure.
 */

const TTL_MS = 1000 * 60 * 60 * 24;

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenaissCardDetail {
  tracked: boolean;
  /** true when this is a graded-market tier shown for reference only —
   *  never fed into tiles, deck totals or checkout */
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
  updatedAt?: string | null;
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

interface CachedRow {
  href: string | null;
  price_usd: number;
  grade_label: string | null;
  confidence: string | null;
  last_sale_at: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  let graded = false;
  let row = db
    .prepare(
      "SELECT href, price_usd, grade_label, confidence, last_sale_at FROM renaiss_prices WHERE card_id = ?"
    )
    .get(id) as CachedRow | undefined;
  if (!row?.href) {
    // no raw-English tier — fall back to the display-only graded match
    row = db
      .prepare(
        "SELECT href, price_usd, grade_label, confidence, last_sale_at FROM renaiss_graded WHERE card_id = ?"
      )
      .get(id) as CachedRow | undefined;
    graded = true;
  }
  if (!row?.href) {
    return NextResponse.json({ tracked: false } satisfies RenaissCardDetail);
  }

  // A basic payload built purely from what we already have locally — used
  // whenever the enrichment call below can't reach the API (rate-limited,
  // network hiccup, etc.). We *know* this card is tracked (that's exactly
  // what the row above proves), so degrading to "tracked: false" in that
  // case would be reporting something we know to be false.
  const basic: RenaissCardDetail = {
    tracked: true,
    graded,
    priceUsd: row.price_usd,
    gradeLabel: row.grade_label ?? undefined,
    confidence: row.confidence,
    lastSaleAt: row.last_sale_at,
    pageUrl: `https://index.renaissos.com${row.href}`,
  };

  const key = `renaiss-detail:${graded ? "g" : "r"}:${row.href}`;
  const cached = kvGet<RenaissCardDetail>(key, TTL_MS);
  if (cached && !cached.stale) return NextResponse.json(cached.value);

  const base = "/v1/cards" + row.href.replace(/^\/card/, "");
  const [detail, fmv] = (await Promise.all([
    renaissApiJson(base),
    renaissApiJson(`${base}/fmv-series`),
  ])) as [any, any];
  if (!detail) {
    // Stale beats nothing; otherwise fall back to the basic local payload —
    // never the hard "untracked" claim, since we know that's wrong here.
    return NextResponse.json(cached ? cached.value : basic);
  }

  const cents = (v: unknown): number | null =>
    typeof v === "number" ? v / 100 : null;
  const payload: RenaissCardDetail = {
    tracked: true,
    graded,
    priceUsd: cents(detail.priceUsdCents),
    gradeLabel: detail.gradeLabel,
    variation: detail.variation ?? null,
    language: detail.language ?? null,
    deltas: {
      d7: detail.deltas?.d7 ?? null,
      d30: detail.deltas?.d30 ?? null,
      d365: detail.deltas?.d365 ?? null,
    },
    confidence: detail.confidence ?? null,
    sourceCount: detail.sourceCount ?? null,
    observationCount: detail.totalObservationCount ?? detail.observationCount ?? null,
    lastSaleAt: detail.lastSaleAt ?? null,
    updatedAt: detail.updatedAt ?? null,
    otherGrades: (detail.otherGrades ?? []).map((g: any) => ({
      gradeLabel: g.gradeLabel,
      usd: cents(g.priceUsdCents),
      deltaPct: g.deltaPct ?? null,
      confidence: g.confidence ?? null,
      current: !!g.current,
    })),
    series: (fmv?.points ?? [])
      .filter((p: any) => typeof p.usdCents === "number")
      .map((p: any) => ({ t: p.t, usd: p.usdCents / 100 })),
    windowDays: fmv?.windowDays ?? null,
    pageUrl: `https://index.renaissos.com${row.href}`,
  };
  kvSet(key, payload);
  return NextResponse.json(payload);
}
