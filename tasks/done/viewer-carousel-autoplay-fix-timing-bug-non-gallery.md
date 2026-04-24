---
title: Viewer — Carousel — Autoplay — Fix timing bug on non-gallery carousels
priority: normal
status: done
area: viewer
---

Carousel autoplay (set via `data-autoplay` attribute) is not triggering in the finished presentation viewer (`/view/:id`) for carousels on slides other than the cover slide gallery. Each slide loads in an iframe via `/slides/deck-preview/:id?readonly=1`. The `Carousel.init(root)` call in `DOMContentLoaded` should start the autoplay timer via `resetTimer()`. Investigate why the interval is not firing — possible causes: `autoplayMs` is read as 0 (attribute missing or parse issue); `mouseenter` pause event fires immediately and never resets; `resetTimer` is called before the carousel has a valid `offsetWidth`, causing `goTo` to translate by 0px every tick. Check `carousel.js` `initOne` → `resetTimer` path with `PB_READONLY=true` context.

## Implementation Summary

**Problem:** Carousel autoplay set via `data-autoplay` was not firing in the presentation viewer (`/view/:id`) for any slide using `carousel.js` (all non-cover slides).

**Root causes found:**

1. **Primary — `mouseenter` clears the timer and it's never reset.** The viewer (`presentation-view/index.html`) uses a single iframe that reloads its `src` on each slide navigation. When the iframe is visible and the user's mouse is positioned anywhere over it, the browser fires `mouseenter` on the carousel element as the new document loads. This immediately calls `clearInterval(timer)` via the hover-pause handler. Since the user is in view mode and doesn't move their mouse out of the carousel, `mouseleave` never fires, so `resetTimer` is never called again — autoplay is permanently killed after the first tick.

2. **Secondary — `goTo(0)` / `resetTimer()` called before layout is computed.** The viewer sets the iframe to `display:none` initially (line 151 of `presentation-view/index.html`). `DOMContentLoaded` fires inside the iframe while it's still hidden, so `el.offsetWidth === 0` at init time. Although `goTo(0)` is safe (index 0 → `translateX(0)`), deferring to `requestAnimationFrame` ensures the transform and timer start after layout is valid.

**Why the cover slide works:** `slide-01-cover.html` uses a fully custom inline carousel implementation with its own autoplay loop — it does not use `carousel.js` at all, so it was never affected.

**Files changed:**

- `builder/features/slides/components/carousel.js`
  - Wrapped the `mouseenter`/`mouseleave` pause handlers in `if (!window.PB_READONLY)` so they are skipped entirely in the viewer/readonly context.
  - Changed the final `resetTimer(); updateNav();` call to defer `goTo(0)` and `resetTimer()` inside a `requestAnimationFrame` callback, so the carousel initializes after layout is computed even when the iframe was `display:none` at load time.
