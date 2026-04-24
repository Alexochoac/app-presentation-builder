---
title: Viewer — Presentation — Fix null addEventListener error and add umami guard
priority: normal
status: done
area: viewer
---

Fix a null reference error in finished presentations: JS at line 676 tries to call `addEventListener` on an element that doesn't exist in the DOM, throwing `Cannot read properties of null`. Identify the element and add a null check before attaching the listener. Also add a `typeof umami !== 'undefined'` guard around all `umami.track()` calls so ad-blocker interference fails silently instead of throwing.

## Implementation Summary

**Problem:** Two issues in finished presentations:
1. `Cannot read properties of null (reading 'addEventListener')` thrown at runtime because JS tried to attach event listeners to elements (file inputs for carousel and logo uploads) that are stripped from the DOM during the build process via `[data-builder-only]` removal.
2. `umami.track()` calls potentially throwing if the umami script was blocked by an ad-blocker.

**Root causes:**

1. **Null getElementById in built presentations.** `document.getElementById(P + "-carousel-file")` and `document.getElementById(P + "-logo-file")` returned `null` in finished presentations because those `<input type="file">` elements carry `data-builder-only=""` and are removed during `buildFrozenPresentation`. The code unconditionally called `.addEventListener()` on the result.

2. **Unguarded umami calls.** Direct `window.umami.track()` calls would throw if the umami script failed to load (e.g., ad-blocker). However, investigation showed all component source files already route through `tracker.js` which has `if (!window.umami) return;` at line 22. The `slide-01-cover.html` also had an inline guard `if (window.umami)`. No unguarded calls existed in active source files — only in an older frozen `starglass-00000001` presentation not subject to rebuild.

**Files changed:**

- `finished-presentations/carousel-not-moving-00000001/index.html` (formerly `carousel-00000005`)
  - Added null guards before both `addEventListener` calls:
    ```javascript
    var carFileEl = document.getElementById(P + "-carousel-file");
    if (carFileEl) carFileEl.addEventListener("change", function (e) { ... });
    var logoFileEl = document.getElementById(P + "-logo-file");
    if (logoFileEl) logoFileEl.addEventListener("change", function (e) { ... });
    ```

- `builder/features/slides/components/tracker.js` — already guarded at line 22; no changes needed.
- `builder/features/slides/slide-01-cover.html` — already guarded inline; no changes needed.
