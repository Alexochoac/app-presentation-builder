---
title: Builder — My Library — Slide Thumbnails and Edit View — Fix missing deck context
type: Issue
priority: H
status: done
completed_at: 2026-06-02 18:00
area: builder
---

Library slide card thumbnails and the edit view opened from My Library were always rendering in a brand-neutral, no-theme state — showing the template's default logo, no deck theme (e.g. glassmorphism), and loading/saving edits from the wrong bucket (`deckEdits.default` instead of the actual deck).

## Root causes

1. The `decks[]` array on every library slide was always `[]` — never populated when slides were added to or removed from decks, so the system had no way to know "is this slide on a deck?"
2. Both `library-preview` and `library-edit` server endpoints ignored deck context entirely: no `withLiveLogos`, no `injectDeckBranding`, no deck theme CSS, wrong edits bucket.

## Desired behaviour

- **Slide on a deck** → thumbnail and edit view render exactly as the slide appears in that deck (deck logos, deck theme, deck hero bg, deck-specific edits).
- **Slide not on any deck** → thumbnail shows template generic logo + slide's own theme + slide's own content.

## Fixes applied (2026-06-02)

### 1. Startup backfill migration — `server.js`
Added migration step 4: scans all `decks/*/deck.json` files at startup and populates `decks[]` on each library slide from actual deck membership. Ran immediately on first boot — 18 slides linked to their decks.

### 2. `POST /api/deck/slides` — `server.js`
After writing the deck, pushes `{ id, name }` into `libSlide.decks[]` and writes `slide-library.json` so future adds are tracked immediately.

### 3. `DELETE /api/deck/slides/:id` — `server.js`
Captures the slide being removed before filtering, then removes that deck's entry from `libSlide.decks[]` so the thumbnail reverts to no-deck rendering when a slide is removed.

### 4. `GET /slides/library-preview/:id` — `server.js`
If `libSlide.decks[0]` exists: resolves edits via `resolveSlideEdits(libSlide, deckId)`, applies `withLiveLogos` + `withBrandCredit` + `injectDeckBranding`, and injects deck `styleCss` / `styleRef` / `deckAccentCss`. If no deck: uses slide's own edits with template-default logo (no branding injected).

### 5. `GET /slides/library-edit/:id` — `server.js`
Reads `?deckId=` query param. Applies full deck context for rendering (same pipeline as library-preview fix above). Embeds `EDIT_DECK_ID` in the inline save script so all saves (text, carousel, image) go to the correct `deckEdits` bucket.

### 6. `POST /api/slide-library/:id/edits` — `server.js`
Reads `deckId` from request body. Saves edits to `deckEdits[deckId]` instead of always hardcoding `deckEdits.default`.

### 7. `openBuilderWithLibrarySlide` — `builder/features/slides/index.html`
Appends `&deckId=slide.decks[0].id` to the builder URL when the slide has a deck association, so the correct deck context flows through.

### 8. `enterLibrarySlideMode` — `builder/features/builder-ui/index.html`
Reads `deckId` from URL params and passes it as `?deckId=` on the library-edit iframe `src`. No-deck slides open without the param, falling back to template-default rendering.

## Implementation Summary

**Problem:** My Library slide thumbnails and the edit view (opened by clicking the gear icon or thumbnail) showed the wrong visual context — no theme (e.g. glassmorphism was missing), the template's generic product logo instead of the deck's customer logo, and edits were loaded from and saved to `deckEdits.default` regardless of which deck the slide actually belonged to.

**Root cause 1 — `decks[]` never populated:** The `decks[]` field on each library slide in `slide-library.json` was always an empty array. When a slide was added to a deck via `POST /api/deck/slides`, nothing updated `slide-library.json`. This meant neither `library-preview` nor `library-edit` could determine which deck a slide belonged to.

**Root cause 2 — endpoints ignored deck context:** Both `GET /slides/library-preview/:id` and `GET /slides/library-edit/:id` used only `libSlide.edits` (or hardcoded `deckEdits.default`) and `libSlide.styleCss`/`libSlide.styleRef`. They never called `withLiveLogos`, `injectDeckBranding`, or applied deck accent CSS. For slides like `lib-company-v2` whose theme (`glassmorphism`) lived on the deck config rather than the slide, this meant the slide rendered with no theme at all.

**Files changed:**
- `builder/server.js` — 6 changes: startup migration, POST add-to-deck, DELETE remove-from-deck, library-preview endpoint, library-edit endpoint, slide-library edits POST endpoint
- `builder/features/slides/index.html` — `openBuilderWithLibrarySlide` appends `&deckId=`
- `builder/features/builder-ui/index.html` — `enterLibrarySlideMode` reads and forwards `deckId` param

**Data fix:** A one-time Node.js script was run to backfill `decks[]` on all 25 existing library slides by scanning `decks/*/deck.json`. Result: 18 slides correctly linked to their decks; 7 slides confirmed as not belonging to any deck.
