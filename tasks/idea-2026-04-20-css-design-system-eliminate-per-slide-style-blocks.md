---
title: Idea — CSS — Design System — Eliminate Per-Slide Style Blocks
priority: low
status: pending
area: css
---

## Status (2026-05-30 update)
A shared `builder/features/slides/style.css` now exists and is the canonical location for all slide CSS. However, individual slide templates still embed their own `<style>` blocks, creating a 3-layer conflict:

1. `shared/app-style.css` — app shell (dark/light theme)
2. `builder/features/slides/style.css` — all slide CSS (this is the target)
3. Per-slide `<style>` blocks inside each template file — these are the ones to eliminate

The risk is that layers 2 and 3 define some of the same classes, causing inconsistencies when styles are changed in one place but not the other.

**The goal:** Remove all `<style>` blocks from individual slide template files, with all slide CSS consolidated in `builder/features/slides/style.css`.

**Risks:**
- Removing a slide's `<style>` block before verifying its classes exist in `style.css` will break that slide
- Each slide uses `ls[N]-` prefixed class names — must migrate one slide at a time with visual verification
- Inline `style=""` attributes that are dynamic or one-off (e.g. `display:none`, `object-position`) stay inline — only rule-based styles go to the stylesheet

**Approach (slide-by-slide):**
1. Pick one slide
2. Diff its `<style>` block against `style.css` — copy any missing rules into `style.css` under a clearly labeled section
3. Remove the `<style>` block from the template file
4. Open builder and visually verify the slide looks identical
5. Repeat for each slide
