---
title: Viewer — Finished Presentations — Restrict editing to view-only interactions
priority: high
status: done
area: viewer
---

In the published/finished presentation viewer, users should only be able to perform view-mode interactions: clicking tabs to switch content, zooming on images, and navigating carousel slides. Instead, edit-mode actions — adding tabs, uploading images, and deleting list items — are currently accessible. Investigate why builder-only controls are rendering in the viewer and restrict them so only the read-only interaction set (tab switch, image zoom, carousel navigation) is available.

## Implementation Summary

**Problem:** Finished presentations rendered edit controls (delete buttons on carousel images, gallery delete X, "Change Image" hover overlay) that should only appear in the builder.

**Root causes found:**

1. `buildFrozenPresentation()` in `server.js` inlined all component JS (`carousel.js`, `tabs.js`, `list.js`, etc.) but never set `window.PB_READONLY = true` before them. All components check this flag at `init()` time to skip edit controls — without it, they always added them.

2. The gallery `OpenGallery()` function always called `injectBuilderControls()` unconditionally, injecting delete buttons regardless of mode.

3. The `car-img-overlay` ("Change Image") div in the gallery's `slide.innerHTML` rebuild template was missing `data-builder-only=""`, so it survived the cheerio build-time strip and appeared in finished presentations on hover.

4. One saved library edit (`lib-cover` → `carousel-track-html`) had the overlay baked in without `data-builder-only`, meaning future builds from that saved state would reproduce the issue.

**Files changed:**

- `builder/server.js`
  - Added `window.PB_READONLY = true;` as the first line of the inline `<script>` block in `buildFrozenPresentation()` so all component scripts skip edit controls
  - Guarded `injectBuilderControls()` call in `OpenGallery` with `if (!window.PB_READONLY)`
  - Added `data-builder-only=""` to the `car-img-overlay` div inside the `slide.innerHTML` rebuild template in `ChangeCarImage`

- `builder/data/slide-library.json`
  - Fixed saved `carousel-track-html` edit on `lib-cover` to include `data-builder-only=""` on the overlay div

- `finished-presentations/acme-00000003/index.html`
- `finished-presentations/acme-copy-00000004/index.html`
- `finished-presentations/softsolution-linescanner-00000005/index.html`
- `finished-presentations/test-1-00000002/index.html`
  - All patched directly with `window.PB_READONLY = true;`, the `PB_READONLY` guard on `injectBuilderControls`, and a CSS injection to hide `[class*="-car-img-overlay"]`
