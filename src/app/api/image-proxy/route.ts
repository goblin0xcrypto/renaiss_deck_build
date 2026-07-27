import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy for card art. Neither optcgapi.com nor the official
 * Bandai TCG site send Access-Control-Allow-Origin, so <canvas>
 * drawImage() of those URLs directly taints the canvas and blocks
 * toDataURL()/toBlob() (used by the deck-poster export). Fetching through
 * our own origin sidesteps CORS entirely. Host-allowlisted to the two image
 * domains we use, to avoid an open proxy.
 *
 * en.onepiece-cardgame.com is the official card-image fallback used when a
 * printing isn't in our optcgapi-synced catalog yet (new sets lag there) —
 * see officialCardImageUrl() in deckImage.ts.
 */
const ALLOWED_HOSTS = new Set(["optcgapi.com", "en.onepiece-cardgame.com"]);

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  if (!src) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "renaiss-deck-build/1.0" },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res || !res.ok) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
