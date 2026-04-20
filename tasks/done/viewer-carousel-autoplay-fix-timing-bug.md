---
title: Viewer — Carousel — Autoplay — Fix timing bug
priority: normal
status: done
area: viewer
---

Carousel autoplay (set via `data-autoplay` attribute) is not triggering in the finished presentation viewer (`/view/:id`).

Each slide loads in an iframe via `/slides/deck-preview/:id?readonly=1`. The `Carousel.init(root)` call in `DOMContentLoaded` should start the autoplay timer via `resetTimer()`. Investigate why the interval is not firing — possible causes:

- `autoplayMs` is being read as 0 (attribute not present or parsing issue)
- `mouseenter` pause event fires immediately and never resets
- `resetTimer` is called before the carousel has a valid `offsetWidth`, causing `goTo` to translate by 0px every tick

Check carousel.js `initOne` → `resetTimer` path with `PB_READONLY=true` context.
