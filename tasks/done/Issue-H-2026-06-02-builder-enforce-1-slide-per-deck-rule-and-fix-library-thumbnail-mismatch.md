---
title: Builder — My Library — Enforce 1-slide-per-deck rule and fix library thumbnail mismatch
type: Issue
priority: H
status: done
completed_at: 2026-06-02 20:00
area: builder
---

Library slide thumbnails in My Library did not match what the slide looked like in the deck. Root cause: a library slide could belong to multiple decks at once. The `library-preview` endpoint always used `decks[0]` for context, so if the user was viewing the slide in a different deck, the thumbnail showed the wrong theme and content. Additionally, duplicating a deck copied the slide list but kept the same `librarySlideId` references, meaning the same library slide ended up in two decks simultaneously.

## Fix

### Rule enforced: 1 library slide → at most 1 deck

- **`POST /api/deck/slides`** — blocks with HTTP 409 if the library slide already belongs to a different deck. Error message: `"[Slide name]" is already in "[Deck name]". Duplicate it first to add a copy to this deck.`
- **`POST /api/decks/:id/duplicate`** — replaced shallow deckEdits copy with a full deep-clone: creates a new library slide for every slide in the source deck, carries over the source deck's effective edits into the new deck context, and updates the new deck's slide list to reference the cloned IDs.
- **`POST /api/slide-library/:id/duplicate`** — manual slide duplicate now clears `decks: []` and `deckEdits: {}` on the clone so it starts unassigned and clean.
- **`slides/index.html` — `pickAddSlide`** — checks response status and surfaces the specific server error message as a toast instead of a generic failure.
- **`slides/index.html` — `addSelectedLibToDeck`** — same per-slide error surfacing in the multi-select add chain.

### Startup rebuild (runs every boot)

Extracted step 4 of `runDeckMigration` into a standalone `rebuildSlideDecks()` IIFE that runs unconditionally on every server start. The old step 4 was gated behind `if (fs.existsSync(getDeckPath('default'))) return` and never ran after the initial migration. The new function:
1. Resets all `decks[]` to `[]`
2. Repopulates from `deck.json` slide lists (authoritative source)
3. If a slide appears in more than one deck, keeps the first (deck store order) and removes it from the extra decks — both in `decks[]` and in the extra deck's `deck.json`

Data was also cleaned up manually: `lib-cover`, `lib-company-v2`, and `lib-1780338645841` were removed from the `hola` deck (they belong to `deck-rebuild`).

## Files changed
- `builder/server.js` — 5 changes: `POST /api/deck/slides` block, deck duplicate deep-clone, slide duplicate clear, `rebuildSlideDecks` IIFE, removed old step 4 from migration guard
- `builder/features/slides/index.html` — 2 changes: `pickAddSlide` and `addSelectedLibToDeck` error handling

## Implementation Summary

**Problem:** My Library thumbnails showed the wrong theme when a library slide belonged to more than one deck. The `library-preview` endpoint always rendered using `decks[0]`, so a slide shared between `deck-rebuild` (no theme) and `hola` (glassmorphism) would always show the `deck-rebuild` context regardless of which deck the user was working in. Deck duplication compounded this by copying slide references without creating new library slides, immediately violating any deck-context assumptions.

**Root cause 1 — multi-deck membership allowed:** Nothing in the add-to-deck flow prevented the same library slide from appearing in multiple decks. `lib-cover`, `lib-company-v2`, and `lib-1780338645841` all existed in both `deck-rebuild` and `hola`.

**Root cause 2 — startup rebuild never ran:** The `decks[]` rebuild (step 4 of `runDeckMigration`) was gated behind `if (fs.existsSync(getDeckPath('default'))) return`. Since `default/deck.json` exists from the original migration, this early return meant step 4 never executed on any subsequent server start, leaving stale or inconsistent `decks[]` data in place.

**Root cause 3 — deck duplicate was shallow:** `POST /api/decks/:id/duplicate` cloned the deck's slide list (same `librarySlideId` values) and copied `deckEdits`, but never created new library slides — immediately putting the same slide in two decks.

**Fixes applied:**
- `POST /api/deck/slides` now returns HTTP 409 with a human-readable message if the slide is already in a different deck
- `POST /api/decks/:id/duplicate` deep-clones every library slide in the source deck: new ID, new name `(Copy)`, source deck's effective edits copied into the new deck's `deckEdits` bucket, `decks[]` set to the new deck only
- `POST /api/slide-library/:id/duplicate` clears `decks: []` and `deckEdits: {}` on the clone
- `rebuildSlideDecks()` IIFE extracted from the migration guard — runs unconditionally on every boot, self-heals any future violations by removing duplicate entries from extra deck files
- `pickAddSlide` and `addSelectedLibToDeck` in `slides/index.html` now parse the response body and surface the server error message as a toast
- Existing bad data cleaned up via standalone script: removed `lib-cover`, `lib-company-v2`, `lib-1780338645841` from `hola/deck.json`
