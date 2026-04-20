---
title: Idea — CSS — Design System — Eliminate Per-Slide Style Blocks
priority: low
status: pending
area: css
---

Each slide file (`slide-NN-name.html`) is a self-contained HTML fragment that includes its own `<style>` block and inline `style=""` attributes alongside the markup. This is intentional — the builder fetches each slide via `/slides/slide-NN-name.html` and injects the raw HTML into the page DOM using `innerHTML`, so the `<style>` block travels with the slide and takes effect automatically.

**What we found:**
- All 16 slide files have their own `<style>` block (slide-01 alone has ~185 lines of CSS inside it)
- There are 150+ inline `style=""` attributes across all slides
- Everything currently works correctly because each slide is self-contained

**The goal:** Move all slide-specific CSS into a shared `style.css` so there is one source of truth, no duplication, and no risk of class name conflicts between slides.

**Risks before doing this:**
- Removing a slide's `<style>` block before its classes exist in `style.css` will break that slide's layout immediately
- Each slide uses unique `ls[N]-` prefixed class names (e.g. `.ls1-customer-logo`, `.ls1-gallery-btn`) — these must all be migrated carefully, one slide at a time
- Inline styles are harder to extract because some are dynamic or one-off (e.g. `style="display:none"`, `object-position:right center`) — not all of them belong in a stylesheet
- The refactor must be done slide-by-slide with visual verification after each one, since there is no automated test for slide appearance

**Recommended approach when ready:**
1. Pick one slide
2. Copy its `<style>` block into `style.css` under a clearly labeled section
3. Remove the `<style>` block from the slide file
4. Open the builder and visually verify that slide looks identical
5. Repeat for each slide
