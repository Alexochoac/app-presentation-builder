---
title: Fix presentation viewer interactivity
priority: high
status: pending
area: dashboard-ui
---

The `/view/:id` presentation viewer renders slides with `pointer-events:none` because
the base `.slide` CSS rule blocks all mouse events, and the viewer shell never adds the
`.active` class or overrides `pointer-events`. Tabs, carousels, lightbox zoom, and CTA
buttons are all silently blocked. Text editing should remain disabled (`PB_READONLY=true`).

## Root cause

`builder/features/slides/style.css` sets:
```css
.slide               { pointer-events: none; }
.slide.active        { pointer-events: auto; }
```

The `/slides/deck-preview/:id` route in `server.js` (lines 66–71) generates an inline
override for the slide but only sets `opacity` and `transform` — it never sets
`pointer-events: auto !important`.

## Fix checklist

- [ ] `server.js` deck-preview inline CSS: add `pointer-events: auto !important` to the
      `.slide` override rule (line ~70)
- [ ] Verify `DOMContentLoaded` handler in the same route initialises all 5 components:
      `Carousel`, `Tabs`, `Lightbox`, `List`, `LSTable` — add any that are missing
- [ ] Confirm `window.PB_READONLY = true` is set so components skip edit controls
      but still bind interaction event listeners (check each component's init function
      doesn't bail out entirely when readonly is true)
- [ ] Test in viewer: tab switching, carousel prev/next, lightbox image zoom, CTA buttons
- [ ] Confirm no text fields, add-image buttons, or delete controls appear in viewer
