---
title: Builder — My Library & Deck Preview — Fix slides showing wrong theme in deck context
type: Issue
priority: H
status: done
completed_at: 2026-06-02 18:30
area: builder
---

Multiple interconnected bugs around how slide themes were applied in the deck context — causing duplicate deck badges, false deck associations, and the CTA slide rendering with a different theme than all other slides in the same deck.

## Problem

1. **Duplicate deck badges** on library slide cards — the `/api/slide-library` endpoint was using `deck.title` (presentation title, e.g. "GlassQuality") instead of `deckMeta.name` (builder label, e.g. "SoftSolution"). Two decks had the same `deck.title`, causing identical badges.

2. **Wrong migration — false deck associations** — the startup migration (step 4) had a secondary pass that checked `deckEdits` keys as evidence of deck membership. `deckEdits` can exist for decks a slide was never added to (orphaned from context switches), so slides got false deck badges. Fixed by rebuilding `decks[]` only from `deck.json` slide lists (the authoritative source), resetting all slides first.

3. **CTA slide showing different theme than other slides in deck** — the render priority was `libSlide.styleCss || deckConfig.styleCss`. One slide ("Call to Action-Validated Style") had its own per-slide glassmorphism CSS (990 chars), while cover and company slides had none. This made CTA look different from the others in the deck builder thumbnail and canvas preview — inconsistent.

## Root Cause of Theme Inconsistency
The deck is the theming authority for a presentation. Per-slide `styleCss`/`styleRef` should only apply when a slide is viewed standalone (not in any deck context). When in a deck, the deck's theme (or no theme if none set) should apply uniformly to all slides.

The `/builder/preview` page already behaved correctly (only injected deck-level CSS). The `deck-preview`, `library-preview`, and `library-edit` endpoints were incorrectly falling back to per-slide CSS.

## Fixes Applied

### 1. `/api/slide-library` (server.js ~line 6017)
Changed `deck.title || deckMeta.name` → `deckMeta.name`. `deck.title` is the customer-facing presentation title, not the builder label.

### 2. Startup migration step 4 (server.js ~line 7559)
Removed the secondary `deckEdits`-key pass. Now resets all `decks[]` to `[]` first, then rebuilds from `deck.json` slide lists only. Runs on every server start to self-heal any desync.

### 3. Theme priority in all 3 render endpoints (server.js)
- `deck-preview`: `deckConfig.styleCss || null` (no slide fallback — deck is sole authority)
- `library-preview`: deck context → `deckConfig.styleCss || null`; standalone → `libSlide.styleCss || null`
- `library-edit`: same pattern as library-preview
- Same for `styleRef`/`finishStyleTag` in all three endpoints

## Implementation Summary

### Problem
Three separate bugs discovered in sequence during a live debugging session:

**Bug 1 — Duplicate deck names in My Library sidebar**
The `GET /api/slide-library` endpoint built deck entries as `{ id, name: deck.title || deckMeta.name }`. `deck.title` is the customer-facing presentation title (stored in `deck.json`), not the builder deck label (stored in `decks.json`). Two decks — `deck-rebuild` and `deck-1780396372095-qm51y` (hola) — both had `deck.title = "GlassQuality (rebuild)"`, so the sidebar showed two identically-named entries.

**Bug 2 — False deck associations on library slide cards**
A secondary migration pass added to the startup migration checked `deckEdits` keys on library slides and added any matching deck to `decks[]`. This was wrong: `deckEdits` entries are created whenever a slide is edited in any deck context, even if the slide was never formally added to that deck. The `lib-cta` slide had `deckEdits['deck-rebuild']` and `deckEdits['hola']` from past edit sessions but was only actually in the `default` deck. The migration added all three as deck badges.

**Bug 3 — CTA slide rendered with different theme in deck context**
`lib-1780338645841` ("Call to Action-Validated Style") had its own per-slide glassmorphism CSS (`styleCss: 990 chars, styleRef: glassmorphism.css`). The other two slides in the same deck (`lib-cover`, `lib-company-v2`) had no per-slide CSS. The render priority `libSlide.styleCss || deckConfig.styleCss` meant CTA showed glassmorphism while the others rendered plain — inconsistent within the same deck.

### Files Changed
- `builder/server.js` — four changes:
  1. `GET /api/slide-library` line ~6017: `deck.title || deckMeta.name` → `deckMeta.name`
  2. Migration step 4 (~line 7559): removed secondary `deckEdits`-key pass; now resets all `decks[]` to `[]` then rebuilds from `deck.json` slide lists only
  3. `GET /slides/deck-preview/:id` (~line 111): `deckConfig.styleCss || libSlide.styleCss` → `deckConfig.styleCss || null` (deck is sole authority; same for `finishStyleTag`)
  4. `GET /slides/library-preview/:id` and `GET /slides/library-edit/:id` (~lines 6601, 6725): deck context → `deckConfig.styleCss || null`; standalone (no deck) → `libSlide.styleCss || null`

### Design Decision
The deck is the sole theming authority when a slide is rendered in a deck context. Per-slide `styleCss`/`styleRef` only apply in standalone library view (no deck). This matches how `/builder/preview` already worked and ensures all slides in a deck look identical regardless of any per-slide CSS they may have stored.
