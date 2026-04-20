---
title: Builder — Cover Slide — Gallery Carousel — Fix overlay, CSS, reordering, delete
priority: high
status: done
area: dashboard-ui
---

Fixed multiple issues with the gallery carousel on the cover slide:

- Gallery overlay was clipped by `.slide.hero { overflow:hidden }` + CSS transform. Fixed by moving the overlay element to `document.body` on open.
- Old `heckcover-` prefixed slides in saved `carousel-track-html` had no CSS. Fixed by normalizing old letter-based prefixes to the current `p` prefix on render (class names and camelCase function calls).
- No delete button on carousel slides. Added `DeleteCarSlide` function and injected ✕ button dynamically on gallery open.
- Move/reorder buttons were stripped on save (`data-builder-only` removal). Fixed by injecting ‹ › buttons dynamically via `injectBuilderControls()` on gallery open.
