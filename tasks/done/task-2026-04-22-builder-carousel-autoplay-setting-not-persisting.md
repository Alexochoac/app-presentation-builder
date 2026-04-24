---
title: Builder — Carousel — Autoplay setting not persisting after build or navigation
priority: normal
status: done
area: builder
---

Carousel autoplay (set via the "⏸ Auto / ▶ 3s / ▶ 5s" button in the builder) was not persisting after navigating away and back to a slide, or after rebuilding a finished presentation. The setting visually updated in the builder session but reverted on any reload or rebuild.

## Implementation Summary

**Problem:** Clicking the autoplay button in the carousel builder updated the in-memory JS state and label, but the `data-autoplay` attribute was never written back to `slide-library.json` in a way that survived re-render.

**Root causes found:**

1. **`preview.html` dropped `body.attrs` for deck slides.** The save handler built a `body.attrs` object with `{ data-autoplay: 5000 }` but only sent `body.edits` to `/api/deck/slides/:id/edits`. The attrs object was silently ignored for all library-based slides.

2. **Three separate render routes, only one patched.** The `__attr:` fix was added to `/slides/deck-preview/:id` (viewer) but the builder actually fetches slides via `/slides/:deckSlideId.html` — a completely different route that wasn't updated.

3. **Slide HTML cache not invalidated after save.** `loaded[index]` in `preview.html` cached the fetched HTML string. After saving, navigating back reused the stale cache and never re-fetched. Fixed by adding `delete loaded[current]` on successful save.

4. **Carousels without `data-edit` on the outer element.** The `__attr:editKey:attrName` system targets `[data-edit="editKey"]` via Cheerio. Carousels embedded inside tabs (e.g. company "Extras" panel, technology) have no `data-edit` attribute — `editKey` fell back to `"carousel"` and Cheerio found nothing. These carousels needed their nearest `[data-edit]` ancestor's HTML saved instead, embedding `data-autoplay` directly in that HTML string.

**Files changed:**

- `builder/features/builder-ui/preview.html`
  - Added `body.edits['__attr:' + editKey + ':data-autoplay'] = String(e.detail.autoplay)` so autoplay is included in deck slide edits (not dropped in attrs)
  - Added `delete loaded[current]` on successful save to invalidate the slide HTML cache
  - Added `console.log` debug lines (can be removed)

- `builder/server.js`
  - `/slides/deck-preview/:id` route: after `renderLayoutToHtml`, apply `__attr:*` edits via Cheerio
  - `/slides/:deckSlideId.html` route (the one the builder actually uses): same `__attr:*` processing added
  - `buildFrozenPresentation` (visible slides): apply `__attr:*` edits during build
  - `buildFrozenPresentation` (hidden/optional slides): same

- `builder/features/slides/components/carousel.js`
  - Auto button click: calls `el.setAttribute('data-autoplay', ...)` to update the DOM attribute immediately
  - If carousel has `data-edit` on itself → dispatches `{ editKey, html: null, autoplay }` (attr save via `__attr:`)
  - If carousel has no `data-edit` (embedded inside tabs etc.) → finds nearest `[data-edit]:not(.slide)` ancestor, clones it, strips builder-only elements, dispatches `{ editKey: parentKey, html: clone.innerHTML }` — embeds `data-autoplay` in the parent's saved HTML
