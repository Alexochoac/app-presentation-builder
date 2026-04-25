---
title: Builder — Slide Manager — Fix Add/Remove deck flow from My Library
type: Issue
priority: M
status: done
area: builder-slides
---

In the Builder > Slide Manager > My Library section, the "Add Slide" flow had several broken behaviours: slides were added to the library only (not the deck), duplicate deck slots were created on repeated clicks, slide names showed as "Untitled Slide" in the deck, the delete button allowed deleting slides still in the deck, and removing a slide from the deck required a page refresh to see it gone.

## Implementation Summary

All fixes are in `builder/features/slides/index.html` and `builder/server.js`.

---

### Fix 1 — Create Slide adds to both library AND deck

**Problem:** `createLibrarySlide()` called `POST /api/library` and stopped — never touched the deck.

**Fix:** After the library slide is created, chain a second `POST /api/deck/slides` call. The returned deck slide (with `librarySlideId` + unique ID) is pushed into `deckSlides` and `renderDeckList()` is called. Toast updated to "Slide added to library and deck".

---

### Fix 2 — Deck shows the correct slide name (not "Untitled Slide")

**Problem:** The deck slide object returned from the server only has `id`, `librarySlideId`, and `visible` — no `name`. `buildDeckCard()` reads `deckSlide.name`, falling back to "Untitled Slide".

**Fix (createLibrarySlide path):** After pushing the deck slide, set `deckSlide.name = created.name` before calling `renderDeckList()`.

**Fix (toggleDeck / Add to Deck path):** After the `POST /api/deck/slides` response, look up the matching library slide in `librarySlides` and copy its `name` onto the deck slide before inserting it into `deckSlides`.

---

### Fix 3 — No duplicate deck slots on repeated "Add to Deck" clicks

**Problem:** The server's `POST /api/deck/slides` always pushed a new slot for non-cover/cta slides, creating duplicates. The client also pushed the returned slide into memory without checking if it was already there.

**Fix (server):** Before creating a new deck slide, check if one with the same `librarySlideId` already exists. If so, return it immediately without writing to disk.

**Fix (client):** Before calling `insertDeckSlideInOrder()`, check `deckSlides.some(s => s.id === newDeckSlide.id)` and skip the insert if already present.

---

### Fix 4 — Delete button disabled while slide is in the deck

**Problem:** The Delete button in My Library was always enabled, allowing deletion of a slide that was actively in the deck.

**Fix:** In `buildLibraryCard()`, if `inDeck === true`, set `delBtn.disabled = true` and `delBtn.title = 'Remove from deck before deleting'`. The click handler is not attached. When the slide is removed from the deck the card re-renders and the button becomes active again.

---

### Fix 5 — Removing from deck updates the UI immediately (no refresh needed)

**Problem:** The remove path in `toggleDeck()` filtered `deckSlides` in memory but never called `renderDeckList()`, so the deck panel only updated after a page reload.

**Fix:** Added `renderDeckList()` immediately after the filter, before the `DELETE` fetch fires.

---

**Files changed:**
- [builder/features/slides/index.html](../builder/features/slides/index.html) — `createLibrarySlide()`, `toggleDeck()`, `buildLibraryCard()`
- [builder/server.js](../builder/server.js) — `POST /api/deck/slides` duplicate guard
