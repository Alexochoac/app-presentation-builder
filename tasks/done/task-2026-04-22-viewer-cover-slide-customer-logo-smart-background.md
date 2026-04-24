---
title: Viewer — Cover Slide — Customer Logo — Apply smart background detection
priority: normal
status: done
area: viewer
---

The cover/hero slide displays the customer logo — apply the same canvas-based background detection logic used on the dashboard card thumbnails. Sample the border pixels of the logo image to determine its background color, then set the logo container's background to match. This ensures the logo always looks clean regardless of whether it has a white, colored, or transparent background.

## Implementation Summary

**Problem:** The customer logo container on the cover/hero slide had a hardcoded `background: #fff`, which looked wrong for logos with colored or transparent backgrounds.

**Root cause found:** The cover slide is not served from `builder/features/slides/slide-01-cover.html` (legacy/unused) — it is dynamically rendered by `renderHeroLayout()` in `builder/server.js`. The fix had to go into the JS strings inside that render function.

**Files changed:**
- `builder/server.js` — `renderHeroLayout()` function, logo upload handler section (~line 631)

**Fixes made:**
- Added a `detectLogoBg(img)` function (same canvas border-pixel sampling logic as the dashboard's `detectLogoBg`) injected into the rendered slide's `<script>` block. Samples the outer 5% ring of border pixels, averages RGBA values, and sets the `.{P}-customer-logo` container's `background` inline style — falls back to `#fff` if the border alpha is below 30 (transparent logo).
- Added an IIFE that runs on initial page load: if the logo image is already loaded, calls `detectLogoBg` immediately; otherwise attaches a `load` listener.
- Updated the logo upload handler to attach a one-shot `load` listener after setting the new `img.src`, so the background updates whenever a new logo is uploaded.
