# Issue: Slide 11 — Tag Carousel Shows Two Stacked Carousels on Empty State

**Priority:** M  
**Date:** 2026-05-25  
**Slide:** Slide 11 (lib-logo-check) — SoftSolution deck

## Problem

When clicking a tag button (Missing print, Distortion, etc.) that has no images attached, two carousels appear stacked on top of each other instead of one.

When an image is added, each carousel accepts one image independently — confirming two carousel instances are rendering.

## Root Cause (Suspected)

The empty-state CSS refactor changed `.ls9-tag-car:not([data-has-slides])` to use `display: flex !important`. This `!important` overrides the inline `display: block` set by the `showTag()` JS function — but it may also be revealing or affecting a second carousel element that should stay hidden.

Possible causes:
- The `display: flex !important` on no-slides carousels is making a previously hidden tag carousel visible
- The main `#ls9-carousel` may not be reliably hidden when a tag is shown
- There may be a duplicate render of the tag carousel HTML

## Files to Check

- `builder/server.js` → `renderCarouselTagsLayout` → CSS block and `showTag()` function
- Inspect the rendered DOM in the browser to count how many `.ls9-tag-car` elements have `display` != `none` when a tag is active

## Acceptance Criteria

- Clicking a tag button shows exactly one carousel
- Empty state ("+ Add images via the button below") shows cleanly centered in a single carousel area
- Adding an image works normally with carousel controls (prev/next, delete, reorder)
