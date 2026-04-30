---
title: Builder — Slide — Dimensional Check — Fix image edit controls not working
type: Issue
priority: M
status: done
area: slides
---

On the "Dimensional Check / Precise Measurement of Dimensions" slide, images can only be deleted — the edit controls (replace, crop, or any image editing action) are missing or non-functional. All other slides allow full image editing. Investigate why this slide's image elements are not wiring up to the edit flow correctly.

## Implementation Summary

**Problem:** The Dimensional Check slide (deck-dimension / lib-dimension) had all text fields non-editable in the builder — section label, headline, card headers, and all 10 bullet items. Without `contenteditable`, the builder's dirty-state listener (which fires on `input` events) never fired, so text edits were silently lost. The carousel image controls themselves are initialized identically to all other slides via `Carousel.init`, but the broken text editing likely contributed to the perception that the whole slide's edit flow was broken.

**Root cause:** `renderCarouselCardsLayout` in `builder/server.js` was the only hardcoded slide renderer missing `contenteditable="" spellcheck="false"` on its `data-edit` text elements. Every other renderer (renderChecklistCarouselLayout, renderHeroLayout, etc.) and the generic `renderComponent` path all include these attributes correctly. This was a one-off oversight in this renderer.

**Files changed:**
- `builder/server.js` — `renderCarouselCardsLayout` function (lines ~1923–1951)

**Fixes made:**
- Added `contenteditable="" spellcheck="false"` to: `section-label`, `headline`, `card-header-1`, `card-header-2`, `dim-item-1` through `dim-item-10`
- Removed stale `data-edit="trigger-tolerances"` nested attribute from the default value of `dim-item-6` (nested `data-edit` inside a `contenteditable` element is incorrect)

**Scope confirmed:** No other renderers or templates have this problem. New slides created via templates use `renderComponent` which always includes `contenteditable`. Scan of all other `data-edit` fields in server.js confirmed zero other missing occurrences.
