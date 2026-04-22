---
title: Build & Deploy — Finished Presentations — Move shared images to shared folder
priority: high
status: done
area: build-deploy
---

When presentations are published to Cloudflare Pages, some images are missing. All images used across presentations (slide assets, component images, etc.) should be copied into `finished-presentations/shared/` during the build step. Each individual presentation folder should only contain that presentation's unique assets — currently just the logo uploaded when creating the presentation. Update the build/publish script to enforce this separation so shared images are never missing on GitHub Pages.

## Implementation Summary

**Problem:** Opening finished presentations locally (and on Cloudflare Pages) showed missing images — specifically the defect button icons on slide 6 (Surface Quality) and the first camera image in the Scratches carousel.

**Root causes found (3):**

1. **CSS `url()` paths not rewritten** — The `rewriteImagePaths` function in `buildFrozenPresentation()` only handled `src="..."` HTML attributes. The defect icon sprite sheet was referenced via `background-image: url('/slides/uploads/...')` inside an inlined `<style>` block, so it was never copied to `shared/` and the path was never rewritten.

2. **`http://localhost:3000` absolute URLs** — Some images were saved into slide data with a full builder origin (`http://localhost:3000/slides/uploads/...`). The resolver had an early return for any `src.startsWith('http')`, so these were skipped entirely and left pointing at a non-existent server URL.

3. **URL-encoded filenames (`%20`)** — Some image paths were stored URL-encoded (e.g. `Defect%20of%20a%20Coating%20Camera%20image%202.png`). The file lookup used the raw encoded string with `path.join()`, which didn't match the actual filename on disk (which has spaces), so the file was silently left unrewritten.

**File changed:** `builder/server.js` — `resolveAndCopyAsset` and `rewriteImagePaths` functions inside `buildFrozenPresentation()`.

**Fixes made:**
- Added `url(...)` regex replacement pass to `rewriteImagePaths` so CSS background-image references are also copied and rewritten.
- Removed the blanket `startsWith('http')` early return; instead strip the `http://localhost` origin before resolving, so builder-saved absolute URLs are treated as local paths.
- Added `decodeURIComponent()` on the filename before the `fs.existsSync` lookup so URL-encoded paths match files on disk.

**New shared assets added:** `Defect_Icons_from_top_to_buttom_...undefined.png` and `Defect_of_a_Coating_Camera_image_2.png` were copied into `finished-presentations/shared/` after the fix.
