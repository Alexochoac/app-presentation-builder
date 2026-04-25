---
title: Viewer — Footer — Slide Navigation Menu — Add jump-to and hidden slides access
type: Feature
priority: M
status: pending
area: viewer
---

Add a navigation menu to the viewer footer (next to the presentation name) with two sections:

**1. Visible slides list** — all slides marked visible in the deck, listed by name. Clicking any entry jumps directly to that slide.

**2. Hidden slides list** — slides marked as hidden in the deck. These are excluded from the normal prev/next navigation sequence entirely — they only appear here. Clicking an entry in this list jumps to that slide.

**Deck-side requirement:**
The builder deck must support a show/hide toggle per slide (if not already present). Hidden slides are saved in the deck config and skipped during sequential navigation in the viewer, but remain accessible via this footer menu.

**UX notes:**
- The menu sits in the footer next to the presentation name, opened by a button (e.g. a grid/menu icon)
- The menu has two labeled sections: "Slides" and "Hidden Slides"
- Hidden slides section only renders if there is at least one hidden slide in the deck
- Active/current slide should be visually indicated in the list
