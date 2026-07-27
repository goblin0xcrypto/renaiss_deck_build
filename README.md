# Renaiss Deck Build — Deck Construction Simulator

A web tool to build, test and analyze card decks: search cards, manage a collection, track deck value, export decks, and buy missing cards in one click.

## Quick Start

```bash
npm install
npm run dev
```

No API keys required — the One Piece catalog syncs automatically from OPTCG API on first use.

Open http://localhost:3000

## Features

| Page | What it does |
|---|---|
| `/` Home | Card search (name, set code like `ST01` / `OP16`, or card code like `OP16-001`), ⌘K shortcut. One Piece meta-deck section aggregated from recent Limitless tournaments: hover-zoom leader tiles, deck modal with counts + prices, Copy SIM, one-click import into the Deck Builder |
| `/card/[id]` Card detail | Live TCGPlayer prices, favorite, owned quantity, add to deck, bullish/bearish voting, favorites / owners / search-heat stats |
| `/collection` | Owned cards (with quantities and total value) + favorites list |
| `/decks` | Create / delete decks |
| `/decks/[id]` | Deck builder: search-to-add, quantity controls, 60-card progress, 4-copy limit warning, total value, TXT/JSON export, Shop OS one-click purchase of missing cards (multi-shop allocation + merged shipping) |
| `/analytics` | Top searched, most favorited/owned, price sentiment (bullish/bearish), top search terms |

## Tech

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Card data, images & prices: [OPTCG API](https://optcgapi.com) (free community One Piece TCG database, TCGPlayer USD pricing scraped daily). The full catalog (~4.7k printings) is synced into local SQLite once a day; search and card lookups are served locally.
- Local persistence: better-sqlite3 (`data.db`, schema auto-created)
- Shop OS checkout is simulated (missing-card calculation → multi-shop allocation → merged-shipping quote)
