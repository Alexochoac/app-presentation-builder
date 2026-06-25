---
title: Viewer — Carousel — Fix nav buttons hidden in published presentations
type: Issue
priority: H
status: done
completed_at: 2026-06-25 16:40
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

## Implementation Summary

Fixed and shipped in **v1.4.7** (2026-06-25).

**Root cause (confirmed exactly as predicted):** `carousel.js` created the prev/next nav arrows with `setAttribute('data-builder-only', '')` (lines 147, 152). Published presentations carry a broad `.readonly [data-builder-only]{display:none}` rule, so the arrows were hidden on slides that use that rule (Products / Surface / Logo Check). The arrows' click handlers (carousel.js ~713-728) and the swipe handler were already attached unconditionally — only the CSS visibility was the problem. The real builder-only controls (add/auto/fit/delete/move) were, and remain, gated behind `if (!window.PB_READONLY)`.

**Files changed:**
- `builder/features/slides/components/carousel.js` — removed the two `setAttribute('data-builder-only', '')` calls from `prevBtn`/`nextBtn`; added a comment explaining they are viewer controls. Safe per the original analysis: `saveCarousel()` clones only the track (arrows live on the carousel root), and `initOne` strips stale `.ls-carousel-prev/.ls-carousel-next` by class before recreating them.
- `builder/server.js` — bumped the builder-preview cache-buster `carousel.js?v=4` → `?v=5`.
- Sidebar version + CHANGELOG.

**Extra step required for already-published presentations:** the freeze pipeline (`buildFrozenPresentation`) **inlines** the component scripts into each frozen `index.html`, so existing published presentations had the old buggy carousel.js baked in. Ran `POST /api/presentations/rebuild-all` on prod → **14 presentations rebuilt, 0 errors**. Verified a rebuilt frozen file: `data-builder-only` on nav buttons = 0 (was 3), new fix-comment present, and `<font color="#ffffff">` = 0 (the earlier white-text cleanup also propagated into the published HTML). New publishes get the fix automatically.
