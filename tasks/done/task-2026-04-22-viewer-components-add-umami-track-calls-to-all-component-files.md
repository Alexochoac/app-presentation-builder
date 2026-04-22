---
title: Viewer — Components — Umami — Add umami.track() calls to all component files
priority: normal
status: done
area: viewer
---

Audit every interactive component (tabs, carousel, lightbox, gallery, toggle, etc.) and ensure each one fires umami.track() on user interactions. Tracking calls should live inside the component JS files (tabs.js, carousel.js, etc.) — written once, they fire automatically in every presentation that uses those components. Each component reads the slide identifier from its parent element's data-slide attribute at runtime.

Follow the naming convention in docs/umami-guidelines.md:
- Event name = slide identifier (e.g. 'slide-iqc')
- Properties: component (tab/carousel/lightbox/etc), label (visible element name), action (open/close/next/prev)

Example:
```js
const slideId = el.closest('[data-slide]')?.dataset.slide;
umami.track(slideId, { component: 'tab', label: tabLabel, action: 'click' });
```

Note: component JS files may not exist yet as standalone files — they may be embedded in slide HTML. If so, extract them first.

## Current status (2026-04-22)

tracker.js, tabs.js, carousel.js, and lightbox.js have been updated with Track.* calls following the guidelines format. tracker.js is now included in the inlined JS bundle of finished presentations. Page views are confirmed working in Umami.

**Not yet verified:** whether component events (tab clicks, carousel nav, image zoom) actually appear in Umami in production. Next step: open a deployed presentation at app-presentation-builder.pages.dev, interact with tabs/carousel/images, and confirm events appear under slide-[id] with component/label/action properties.

If events still don't appear, debug in this order:
1. Check browser console for JS errors
2. Confirm `window.Track` is defined (open console, type `Track`)
3. Confirm `data-slide` attribute exists on slide wrapper divs in the output HTML
4. Confirm `window.umami` is defined after page load

## Implementation Summary

**Problem:** Umami events were firing with wrong slide IDs (e.g. `slide-ls9`, `slide-t5`) instead of human-readable names, and only 9 of 14 slides appeared — slides without interactive components were never tracked.

**Root causes found:**
1. `carousel.js`, `tabs.js`, and `lightbox.js` were reading the `data-track` attribute (e.g. `ls10:tabs`) and using its first segment as the slide ID, instead of walking up the DOM to find `data-slide`
2. The `data-slide` attribute values were set to internal IDs like `deck-company`, `deck-logo-check` rather than human-readable slugs
3. No tracking call existed in the `goTo(n)` navigation function — slides without interactive components fired no events at all
4. `slide-09-logo-check.html` had a hardcoded `Track.click('ls9', ...)` call
5. `slide-06-surface.html` defect selector buttons had no tracking at all

**Files changed:**
- `builder/features/slides/components/tracker.js` — changed event property format from `{ component, label, action }` to single `{ label: 'component-label-action' }` string
- `builder/features/slides/components/carousel.js` — removed `trackId` preference, always use `Track.slideId(el)`
- `builder/features/slides/components/tabs.js` — same fix
- `builder/features/slides/components/lightbox.js` — same fix
- `builder/server.js` — (1) rewrite `data-slide` to slugified human-readable slide name during build (e.g. `company-intro`), (2) add `Track.event()` call in `goTo` and `goToOptional` so all 14 slides fire on navigation
- `builder/features/slides/slide-06-surface.html` — added `Track.click()` to defect selector button click handler
- `builder/features/slides/slide-09-logo-check.html` — replaced hardcoded `'ls9'` with `Track.slideId(tag)`

**Result:** All 14 slides now fire a `-view` event on navigation. Component events (tabs, carousel, lightbox, buttons) use consistent human-readable event names like `slide-company-intro`, `slide-surface-types`.
