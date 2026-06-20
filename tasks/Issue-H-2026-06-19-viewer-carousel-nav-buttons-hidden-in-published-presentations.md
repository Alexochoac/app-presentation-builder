---
title: Viewer — Carousel — Fix nav buttons hidden in published presentations
type: Issue
priority: H
status: pending
area: slides
---

In published presentations, the carousel prev/next navigation buttons are invisible on slides that use a broad `.readonly [data-builder-only] { display:none }` CSS rule. The buttons are created by `carousel.js` at runtime with `data-builder-only=""`, so they get hidden by that rule even though they are needed by the viewer to switch images.

**Root cause:** `carousel.js` lines 148 and 152 — `prevBtn` and `nextBtn` are incorrectly marked `data-builder-only`. These are viewer navigation controls, not builder-only affordances. The actual builder-only controls (add/delete/reorder/fit buttons) are already gated behind `if (!window.PB_READONLY)` and are never created in published mode.

**Affected slides (have both a carousel AND the broad rule):**
- `slide-04-products.html` — Products Overview carousel
- `slide-06-surface-v2.html` — Surface Defects carousels
- `slide-09-logo-check-v2.html` — Logo Check carousels

**Fix:** Remove the two `setAttribute('data-builder-only', '')` calls from `prevBtn` and `nextBtn` in `carousel.js`. Safe to do: `saveCarousel()` clones only the track (nav buttons are appended to the carousel root, not the track), and `initOne` already strips stale `.ls-carousel-prev/.ls-carousel-next` by class before re-creating them.

**Why technology slide (template05) works:** Its readonly CSS only hides `[data-ls-add]` and `[data-ls-restore]` — it never touches `[data-builder-only]`.
