---
title: Builder — Your Presentation — Hidden Slides — Visual and output behavior
priority: normal
status: done
area: builder
---

When a slide is marked hidden in the Your Presentation section, two things must happen:
1. The Slide Preview must show only unhidden slides — hidden slides are fully removed from the preview count and tile list (not just grayed out).
2. Hidden slides must be excluded from the main presentation flow and instead made available via a menu on the CTA slide (last slide), so viewers can access them as optional extras.

## Summary of what was implemented

**Builder UI (slides/index.html):**
- Hidden slides stay in their original position in the deck list (not moved to bottom), shown with faded title and eye-off icon
- Deck slide count (`deckCount`) only counts visible slides
- Slide Preview nav counter and prev/next navigation only count and traverse visible slides
- When the currently previewed slide is hidden, preview automatically jumps to the nearest visible slide before it (or after if none before)
- Cover (`lib-cover`) and CTA (`lib-cta`) slides are hard-locked: lock icon replaces the eye button, drag handle is disabled, drop handler rejects moves that would displace them
- Adding a new Cover slide replaces the existing cover and places it at position 0; adding a new CTA replaces the existing CTA and places it at the end
- Preview nav counter updates immediately when a slide is hidden/shown

**Frozen presentation output (server.js):**
- Hidden slides are rendered after the main visible slides as `fp-optional` elements
- On the last visible slide, a "More ▾" button appears in the header
- Clicking it opens a dropdown panel listing all hidden slide names
- Clicking a name navigates to that optional slide (prev/next and keyboard nav disabled while viewing)
- A "← Back to Presentation" button returns the viewer to the last main slide
- If no hidden slides exist, the extras button is not rendered
