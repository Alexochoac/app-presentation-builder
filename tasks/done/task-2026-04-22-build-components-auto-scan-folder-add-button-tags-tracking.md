---
title: Build — Components — Auto-scan components folder and add button.js + tags.js with tracking
priority: normal
status: done
area: build-deploy
---

Two related fixes to ensure tracking works for all slides including layout-builder-generated ones:

1. Replace the hardcoded components array in buildFrozenPresentation() (server.js:3132) with a dynamic fs.readdirSync scan of the components folder. This way any new .js file added to builder/features/slides/components/ is automatically inlined into finished presentations without touching server.js.

2. Create button.js and tags.js shared component files (alongside carousel.js, tabs.js, etc.) that attach Track.click() calls on page load to any .slide-btn and .slide-tag elements. This ensures layout-builder-generated slides with buttons or tags get tracking for free in finished presentations, just like carousel and tabs already do.

## Implementation Summary

**Problem:** The hardcoded components array in `buildFrozenPresentation()` meant any new component JS file added to the components folder would be silently excluded from finished presentations. Additionally, layout-builder-generated slides using `.slide-btn` or `.slide-tag` elements had no tracking — unlike carousel and tabs which had shared component JS files that auto-attached `Track.*` calls.

**Root cause:** `buildFrozenPresentation()` in `builder/server.js` had a static array `['tracker', 'lightbox', 'carousel', 'tabs', 'list', 'table']` that had to be manually updated every time a new component file was added.

**Files changed:**

- `builder/server.js` — replaced the hardcoded array with `fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'))`. All `.js` files in the components folder are now automatically inlined at build time.
- `builder/features/slides/components/button.js` — new component that attaches `Track.click()` to every `.slide-btn` element on page load, using the button's text content as the label. Exposes `window.Button.init(slideEl)` for dynamic slide injection.
- `builder/features/slides/components/tags.js` — new component that attaches `Track.click()` to every `.slide-tag` element on page load, using the tag's text content as the label. Exposes `window.Tags.init(slideEl)` for dynamic slide injection.

**Verified:** Built presentation `softsolution-00000005/index.html` confirmed to contain `window.Button`, `window.Tags`, `window.Track`, `window.Carousel`, `window.Tabs`, and `window.Lightbox` all inlined correctly.
