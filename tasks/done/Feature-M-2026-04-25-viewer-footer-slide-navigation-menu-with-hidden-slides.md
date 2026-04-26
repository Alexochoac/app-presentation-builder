---
title: Viewer — Footer — Slide Navigation Menu — Add jump-to and hidden slides access
type: Feature
priority: M
status: done
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

## Implementation Summary

**Files changed:** `builder/server.js` (inside `buildFrozenPresentation`)

### What was built

A grid-icon button was added to the footer of every published presentation. Clicking it opens a navigation menu that pops up above the button with two sections:

- **Slides** — always visible, lists all visible slides. Clicking any jumps directly to that slide from anywhere in the presentation.
- **Hidden Slides** — only shown when on the last visible slide OR when already viewing a hidden slide. Lists all hidden slides. Clicking jumps to that hidden slide.

The active slide is highlighted with a `›` prefix and bold text (`fp-nm-active` class).

### Key design decisions

- **Hidden slides accessible on last slide** — the hidden section only appears in the menu when `idx === total - 1` or `inOptional === true`, matching the original Extras button behavior but now integrated into a single footer menu.
- **Hidden slides have full prev/next navigation** — when viewing a hidden slide, the counter shows position within hidden slides (e.g. `1 / 2`), and prev/next/arrow buttons navigate between hidden slides using a dedicated `optIdx` variable.
- **Returning to visible slides** — while viewing a hidden slide, clicking any visible slide in the menu hides the current optional slide and navigates to the selected main slide.
- **Old Extras/Back buttons removed** — the previous header-based Extras button, Back button, and extras panel were removed as this menu supersedes them entirely.

### Bugs fixed along the way

- **Carousel file input crash** — old presentations built before `window.PB_READONLY = true` was added would crash on `document.getElementById(P + "-carousel-file").addEventListener(...)` because the file input is stripped in viewer builds. Fixed with a null check: `var _cf = document.getElementById(...); if (_cf) _cf.addEventListener(...)`.
- **Menu toggle staying hidden** — toggling `display` to `""` (empty string) caused the CSS `display: none` rule to reapply. Fixed by toggling between `"none"` and `"block"` explicitly.
- **Clicks not reaching menu items** — the viewer's slide content (`pointer-events: auto !important`) was intercepting clicks over the menu. Fixed by adding `z-index: 10` to `#fp-footer`, establishing a stacking context above the viewer.
- **Menu anchoring** — wrapped the button in `#fp-nav-menu-wrap` with `position: relative` so the menu panel anchors above the button, not the full-width footer edge.
- **Returning from hidden slide** — `goTo()` was only hiding `mainSlides[idx]`, not the current optional slide. Fixed to call `optSlides.forEach(s => s.style.display = "none")` when `inOptional` is true before showing the target main slide.
