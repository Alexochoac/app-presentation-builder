---
title: Builder — Deck Sidebar — Smart Collapse Behavior
type: Feature
priority: S
status: done
completed_at: 2026-05-24 14:00
area: builder
---

Deck sidebar now only expands when hovering over a deck row (logo or card) — not on mouseenter of the full collapsed strip. Auto-collapses 3 seconds after the mouse leaves the sidebar. Timer cancels if the mouse re-enters any deck row or the sidebar before 3 seconds elapse.

**Changes in** `builder/features/builder-ui/index.html`:
- `initDeckSidebarHover()` — removed full-sidebar mouseenter expand; now only listens for mouseleave to schedule collapse and mouseenter to cancel it.
- Added `attachDeckRowHover(row)` — attaches mouseenter to each deck row to trigger expand + cancel any pending collapse timer.
- Added `scheduleDeckCollapse()` / `cancelDeckCollapse()` — 3-second debounced collapse with a shared `deckCollapseTimer`.
- `renderDecks()` — calls `attachDeckRowHover(row)` for each row when the list re-renders.

## Implementation Summary

**Problem:** The deck sidebar expanded as soon as the mouse touched anywhere on the collapsed strip, which felt too aggressive and got in the way during normal navigation.

**Goal:** Make the sidebar feel intentional — only open when the user hovers a real deck card, and collapse quietly after a short delay.

**Changes made in `builder/features/builder-ui/index.html`:**

- Removed the `mouseenter` listener from the full `.deck-sidebar` element that was triggering expand on any touch of the strip.
- `initDeckSidebarHover()` now only attaches:
  - `mouseleave` → `scheduleDeckCollapse()` (3-second countdown to add `.collapsed`)
  - `mouseenter` → `cancelDeckCollapse()` (cancels any pending countdown)
- Added `attachDeckRowHover(row)` — called once per row during `renderDecks()`. Each deck row's `mouseenter` removes `.collapsed` from the sidebar and cancels any active collapse timer.
- Added module-level `deckCollapseTimer` variable shared across `scheduleDeckCollapse` / `cancelDeckCollapse`.
- `renderDecks()` calls `attachDeckRowHover(row)` inside the existing `.deck-row` forEach loop so newly rendered rows always get the handler.
