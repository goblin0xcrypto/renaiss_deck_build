import { toDataURL as qrToDataURL } from "qrcode";

/**
 * Renders a shareable "deck poster" PNG for a meta archetype: banner + QR
 * (scanning it hits `/api/meta/import?leader=` which creates the deck and
 * redirects into the builder), a card grid with cost/quantity badges, and
 * cost/type/counter distribution bars. Browser-only (uses <canvas>/Image) —
 * only ever called from a client component.
 *
 * Card art is loaded through `/api/image-proxy` rather than directly from
 * optcgapi.com: that host sends no CORS headers, so a direct cross-origin
 * draw would taint the canvas and block toDataURL().
 */

export interface DeckPosterCard {
  code: string;
  name: string;
  count: number;
  group: "leader" | "character" | "event" | "stage" | string;
  image: string | null;
  cost: number | null;
  counterValue: number | null;
}

export interface DeckPosterInput {
  title: string;
  subtitle?: string | null;
  bannerImage: string | null;
  leaderCode: string; // for the official-site fallback if bannerImage is missing/broken
  cards: DeckPosterCard[]; // one entry per unique card, leader first
  importUrl: string;
}

// Mirrors the app's globals.css tokens (canvas can't read CSS vars).
const COLORS = {
  background: "#0b0b0d",
  surface: "#141418",
  elevated: "#1c1c22",
  edge: "#26262d",
  ink: "#ececef",
  muted: "#8f8f99",
  accent: "#e3aa4e",
  accentDim: "#a87d35",
};

function proxied(url: string | null): string | null {
  return url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : null;
}

/**
 * Official Bandai TCG card image — second-tier fallback for printings our
 * optcgapi-synced catalog doesn't have yet (new sets lag there, e.g. ST32).
 * Same filename convention as our own printing ids, including the parallel
 * suffix (`OP01-001_p1.png`), so no translation is needed.
 */
function officialCardImageUrl(code: string): string {
  return `https://en.onepiece-cardgame.com/images/cardlist/card/${code}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** First candidate URL that actually loads; null once every source is exhausted. */
async function loadFirstAvailable(
  urls: (string | null)[]
): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      return await loadImage(url);
    } catch {
      /* try the next source */
    }
  }
  return null;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

/** Rounded top corners, square base — bars anchor to a baseline. */
function topRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * Cover-fit crop. `focusY` (0=top, 0.5=center, 1=bottom) picks which part of
 * the source stays in frame vertically — card art has the character's
 * portrait in the upper portion and rules text/stats at the bottom, so the
 * banner crop biases toward the top instead of centering (which lands on
 * the character's torso/the text box). `zoom` crops in tighter to cut the
 * card's outer frame and bottom text box out of the visible slice.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  focusY = 0.5,
  zoom = 1
) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, Math.min(img.height - sh, (img.height - sh) * focusY));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

/**
 * Three independent small-multiple bar groups (cost / type / counter
 * distribution). Each group is scaled to its OWN max value — they measure
 * different things (a cost curve vs. a type split vs. a counter split), so
 * sharing one y-scale would crush whichever group has the smallest numbers.
 */
function drawStatGroups(
  ctx: CanvasRenderingContext2D,
  groups: { label: string; entries: [string, number][] }[],
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (groups.length === 0) return;
  const DIVIDER_GAP = 32;
  const groupW = (w - DIVIDER_GAP * (groups.length - 1)) / groups.length;
  const barMaxH = h - 56;

  groups.forEach((g, gi) => {
    const gx = x + gi * (groupW + DIVIDER_GAP);
    const maxVal = Math.max(1, ...g.entries.map(([, v]) => v));

    if (gi > 0) {
      ctx.strokeStyle = COLORS.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx - DIVIDER_GAP / 2, y);
      ctx.lineTo(gx - DIVIDER_GAP / 2, y + h - 4);
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(g.label.toUpperCase(), gx, y + 10);

    const barAreaY = y + 30;
    const n = g.entries.length;
    const barW = Math.min(40, (groupW - 16) / n - 12);
    const gap = n > 1 ? (groupW - 16 - barW * n) / (n - 1) : 0;

    g.entries.forEach(([label, val], i) => {
      const bx = gx + i * (barW + gap);
      const bh = Math.max(4, (val / maxVal) * barMaxH);
      const by = barAreaY + (barMaxH - bh);
      ctx.fillStyle = COLORS.accent;
      topRoundedRectPath(ctx, bx, by, barW, bh, 4);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(val), bx + barW / 2, by - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "400 11px system-ui, sans-serif";
      ctx.fillText(label, bx + barW / 2, barAreaY + barMaxH + 16);
    });
  });
}

export async function renderDeckPoster(input: DeckPosterInput): Promise<string> {
  const W = 1400;
  const PAD = 40;
  const CONTENT_W = W - PAD * 2;
  const COLUMNS = 6;
  const GRID_GAP = 20;
  const CELL_W = (CONTENT_W - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
  const CARD_H = Math.round((CELL_W * 88) / 63);
  const LABEL_H = 46;
  const CELL_H = CARD_H + LABEL_H;
  const BANNER_H = 220;
  const SECTION_GAP = 28;
  const STATS_H = 210;
  const FOOTER_H = 36;

  const rows = Math.ceil(input.cards.length / COLUMNS);
  const gridH = rows * CELL_H + (rows - 1) * GRID_GAP;

  const H =
    PAD +
    BANNER_H +
    SECTION_GAP +
    gridH +
    SECTION_GAP +
    STATS_H +
    SECTION_GAP +
    FOOTER_H +
    PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, W, H);

  let cursorY = PAD;

  // ---- Banner ----
  const bannerX = PAD;
  const bannerY = cursorY;
  ctx.save();
  roundRectPath(ctx, bannerX, bannerY, CONTENT_W, BANNER_H, 20);
  ctx.clip();
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(bannerX, bannerY, CONTENT_W, BANNER_H);
  const bannerImg = await loadFirstAvailable([
    proxied(input.bannerImage),
    proxied(officialCardImageUrl(input.leaderCode)),
  ]);
  if (bannerImg) {
    drawCover(ctx, bannerImg, bannerX, bannerY, CONTENT_W * 0.62, BANNER_H, 0.3, 1.1);
  }
  const fade = ctx.createLinearGradient(bannerX, 0, bannerX + CONTENT_W, 0);
  fade.addColorStop(0, "rgba(11,11,13,0.35)");
  fade.addColorStop(0.55, "rgba(11,11,13,0.78)");
  fade.addColorStop(1, "rgba(11,11,13,0.94)");
  ctx.fillStyle = fade;
  ctx.fillRect(bannerX, bannerY, CONTENT_W, BANNER_H);
  ctx.restore();
  roundRectPath(ctx, bannerX, bannerY, CONTENT_W, BANNER_H, 20);
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.ink;
  ctx.font = "700 38px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    truncateToWidth(ctx, input.title, CONTENT_W * 0.58),
    bannerX + 36,
    bannerY + BANNER_H / 2 - 4
  );
  if (input.subtitle) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "400 17px system-ui, sans-serif";
    ctx.fillText(
      truncateToWidth(ctx, input.subtitle, CONTENT_W * 0.58),
      bannerX + 36,
      bannerY + BANNER_H / 2 + 26
    );
  }

  const qrSize = BANNER_H - 56;
  const qrX = bannerX + CONTENT_W - qrSize - 28;
  const qrY = bannerY + 20;
  const qrDataUrl = await qrToDataURL(input.importUrl, {
    margin: 1,
    width: 400,
    color: { dark: "#0b0b0dff", light: "#ffffffff" },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan → load in Deck Builder", qrX + qrSize / 2, qrY + qrSize + 24);

  cursorY += BANNER_H + SECTION_GAP;

  // ---- Card grid ----
  // Our catalog's own art first; the official Bandai site fills in printings
  // optcgapi hasn't synced yet (new sets lag there) — only if both miss does
  // the cell fall through to the "Not yet in catalog" placeholder below.
  const cardImages = await Promise.all(
    input.cards.map((c) =>
      loadFirstAvailable([proxied(c.image), proxied(officialCardImageUrl(c.code))])
    )
  );

  input.cards.forEach((c, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = PAD + col * (CELL_W + GRID_GAP);
    const y = cursorY + row * (CELL_H + GRID_GAP);

    roundRectPath(ctx, x, y, CELL_W, CARD_H, 10);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = COLORS.elevated;
    ctx.fillRect(x, y, CELL_W, CARD_H);
    const img = cardImages[i];
    if (img) {
      drawCover(ctx, img, x, y, CELL_W, CARD_H);
    } else {
      // not yet synced from the card data source — say so instead of a
      // silent blank box (mirrors the "Not yet in catalog" list badge)
      ctx.fillStyle = COLORS.muted;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Not yet in", x + CELL_W / 2, y + CARD_H / 2 - 9);
      ctx.fillText("catalog", x + CELL_W / 2, y + CARD_H / 2 + 9);
    }
    ctx.restore();
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x, y, CELL_W, CARD_H, 10);
    ctx.stroke();

    if (c.cost != null) {
      const bw = 30;
      const bh = 26;
      ctx.fillStyle = "rgba(11,11,13,0.85)";
      roundRectPath(ctx, x + 6, y + 6, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = COLORS.accentDim;
      ctx.lineWidth = 1;
      roundRectPath(ctx, x + 6, y + 6, bw, bh, 6);
      ctx.stroke();
      ctx.fillStyle = COLORS.accent;
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.cost), x + 6 + bw / 2, y + 6 + bh / 2 + 1);
    }

    {
      const bw = 36;
      const bh = 28;
      const bx = x + CELL_W - bw - 6;
      const by = y + 6;
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      roundRectPath(ctx, bx, by, bw, bh, 6);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${c.count}×`, bx + bw / 2, by + bh / 2 + 1);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(
      truncateToWidth(ctx, c.name, CELL_W - 8),
      x + CELL_W / 2,
      y + CARD_H + 20
    );
    ctx.fillStyle = COLORS.muted;
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillText(c.code, x + CELL_W / 2, y + CARD_H + 38);
  });

  cursorY += gridH + SECTION_GAP;

  // ---- Stats panel ----
  roundRectPath(ctx, PAD, cursorY, CONTENT_W, STATS_H, 16);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const nonLeader = input.cards.filter((c) => c.group !== "leader");
  const costCounts = new Map<number, number>();
  const typeCounts = new Map<string, number>();
  const counterCounts = new Map<number, number>();
  for (const c of nonLeader) {
    if (c.cost != null) costCounts.set(c.cost, (costCounts.get(c.cost) ?? 0) + c.count);
    typeCounts.set(c.group, (typeCounts.get(c.group) ?? 0) + c.count);
    if (c.counterValue != null)
      counterCounts.set(c.counterValue, (counterCounts.get(c.counterValue) ?? 0) + c.count);
  }

  const groups = [
    {
      label: "Cost",
      entries: [...costCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => [String(k), v] as [string, number]),
    },
    {
      label: "Type",
      entries: (["character", "event", "stage"] as const)
        .filter((g) => typeCounts.has(g))
        .map((g) => [g.toUpperCase(), typeCounts.get(g)!] as [string, number]),
    },
    {
      label: "Counter",
      entries: [...counterCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => [String(k), v] as [string, number]),
    },
  ].filter((g) => g.entries.length > 0);

  drawStatGroups(ctx, groups, PAD + 24, cursorY + 22, CONTENT_W - 48, STATS_H - 40);

  cursorY += STATS_H + SECTION_GAP;

  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Renaiss Deck Build · cards via OPTCG API · prices via Renaiss OS Index",
    W / 2,
    cursorY + FOOTER_H / 2 + 4
  );

  return canvas.toDataURL("image/png");
}
