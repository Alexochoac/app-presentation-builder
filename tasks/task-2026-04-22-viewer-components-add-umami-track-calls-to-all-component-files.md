---
title: Viewer — Components — Umami — Add umami.track() calls to all component files
priority: normal
status: pending
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
