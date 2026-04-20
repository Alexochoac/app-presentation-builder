---
title: Viewer — Cover Slide — Gallery Button — Fix missing button
priority: normal
status: done
area: viewer
---

The cover slide (slide-01) has a "Gallery" button that opens an installation photo carousel overlay. This button has `data-builder-only=""` so it is hidden in the presentation viewer via the readonly CSS rule:

```css
[data-builder-only] { display:none !important; }
```

The gallery overlay and its controls also have `data-builder-only`. To expose the gallery in the viewer:

1. Remove `data-builder-only` from the gallery trigger button in the slide-01 template (server.js)
2. Remove `data-builder-only` from the gallery overlay `div` itself
3. Keep `data-builder-only` on edit-only controls inside the overlay (add image button, move buttons, caption edit, autoplay control)
4. Test that the gallery opens and closes correctly in readonly mode with no edit controls visible
