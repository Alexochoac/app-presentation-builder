---
title: Builder — Slides — Standardization — Responsive model (pb-responsive) + Why Us rebuild + unified render path
type: Feature
priority: H
status: done
completed_at: 2026-06-09 20:21
area: slides
---

Session work (2026-06-07 → 2026-06-09) on the pipeline-standardization initiative: unify the cartridge render path, rebuild slide #3 (Why Us), and introduce + propagate a shared responsive model so the slide is the sole scroll container (no inner clipping) with fluid chrome — applied to all rebuilt slides and documented as a build standard.

## Implementation Summary

### 1. Single render path — `renderCartridge()`
**Problem:** `server.js` had **6 independent cartridge-render sites** (deck-preview, Builder Preview, publish ×2, library-preview, library-edit), each duplicating `read file → injectGallery → applyEditsToHtml → injectDeckBranding`. Every per-slide feature had to be hand-wired into all six — the root cause of the recurring "shows in deck preview but not Builder Preview" drift.
**Fix:** Extracted one `renderCartridge(resolved, {galleryEnabled, rawEdits, deck, editable})` (server.js ~4177) that folds gallery injection + edit-wrapping (`withBrandCredit(withLiveLogos())`) + edit application + deck branding into one place; replaced all 6 cartridge branches with a call to it. Behavior verified **byte-identical** before/after across the 4 GET surfaces via an isolated `PORT=3007` test instance diffed against the running old-code server (publish ×2 use the identical folded call — inspection-verified). Side change: `PORT` is now `process.env.PORT || 3000`.

### 2. Slide #3 "Why Us" rebuilt
- New `template03-why-us` / `builder/features/slides/slide-03-why-us.html` / library slide `lib-why-us`, joined to `deck-rebuild`. Registered in `templates.json`; validator clean (0/0).
- Problem-vs-benefit two-column compare composed from `.card`; real LineScanner/Osprey content migrated into `deckEdits["deck-rebuild"]` (old `tpl-new-comparison`/`lib-comparison` kept as fallback).
- **list.js controls restored** (regression from first pass): both columns wired to the shared `list.js` (drag-reorder ⠿, hide ×, Shift+×=delete, + Add item, dblclick-edit). Tier labels are `<div class="compare-tier" data-edit="tier-label-N">` so list.js skips them; the data was reshaped from `<li>` → `<div>` in `templates.json` + `slide-library.json`.

### 3. Translation Center — per-line list editing
**Problem:** list fields (`data-ls-list` blobs) never appeared in the Translation Center — the frontend dropped any field whose English was >400 chars (preview.html). The lists were translatable at publish but invisible/uneditable in the TC. System-wide (also affected slide-05/slide-10).
**Fix (preview.html):** list fields now render **one `<li>` per line** — English read-only (edited on the slide via list.js), each language editable per-line and rebuilt into `<li>`/tier HTML on save (so the publish baker swaps the whole translated `<ul>`). Tier labels surface as lines; their duplicate standalone rows are suppressed. Exempted list blobs from the 400-char filter. Round-trip (EN structure + translated lines → bake-ready `<ul>`) unit-tested.

### 4. Responsive model — `pb-responsive` + `pb-chrome` (the big one)
**Problem:** every slide is viewport-sized (`100dvh`, `overflow:hidden` container). The shared `@media(min-width:769px)` model forced content slides to a fixed height with `.slide-body { overflow:hidden }` + `justify-content:center` + an identity `transform:scale(1)`. On **medium screens** (laptop/iPad ~769–1100px) content overflowed and was **clipped with no way to reach it** (esp. the top, due to `justify-content:center` on a scroll container). `tabs.js` baked the same fixed-height assumption (`.ls-tabs height:100%`, `.ls-tab-panel height:100%`).
**Fix:** new shared **`pb-responsive`** opt-in root class (`builder/features/slides/style.css`, rulebook §3) — the slide is the **sole scroll container**: content stacks and the whole slide scrolls; no inner element gets fixed height/overflow; `justify-content: safe center` (centers when it fits, top-aligns + scrolls when not); columns use width-driven `repeat(auto-fit, minmax(Npx,1fr))` (no device breakpoint); ~72px top clearance so the centered header never rides under the corner logo/credit; active slide `transform:none` so `position:fixed` controls pin to the **viewport** (a transformed ancestor traps `fixed` to itself → scrolls/clips). Neutralizes tabs.js's fixed heights for pb-responsive slides. **Opt-in** so legacy slides are untouched.
- Fluid corner chrome (logo row + credit scaling via `clamp()`) split into **`pb-chrome`** (included by `pb-responsive`; hero/cover slides use it alone). Logo `!important` needed because the builder sets an inline height on injected logos at runtime (the classless first logo otherwise wouldn't shrink).

### 5. Propagation to all rebuilt slides
- **Why Us (#3):** adopted `pb-responsive`; deleted per-slide `!important` crutches (now in shared).
- **CTA (#16):** adopted `pb-responsive`; dropped `flex:1`/`min-height:0` box + breakpoint padding.
- **Company (#2):** adopted `pb-responsive`; converted tabs/pillars/map/iqc from `flex:1; min-height:0; height:100%` to content-flow; carousel given a viewport-relative height `clamp(240px,42vh,380px)` + **`flex:none !important`** (its inline `flex:1` was collapsing it to 0 and hiding the "Add images" state); iqc + stats grids → `auto-fit`.
- **Cover (#1):** `pb-chrome` only (hero, non-scrolling). Also released the transform trap for `pb-chrome` so its `position:fixed` gallery button isn't clipped by the hero's `overflow:hidden`.

### 6. Enforcement + foundations
- **Rulebook §3** documents `pb-responsive` (+ `pb-chrome`) as a build requirement for content cartridges, plus the carousel `flex:none` gotcha.
- **`scripts/validate.js`** now WARNs any `.slide.content` cartridge missing `pb-responsive` (heroes exempt).
- **Feature-dock foundation:** the gallery button is now a viewport-`fixed` bottom-right control (beside the `f` in the builder; alone in the corner in published output); full dock + responsive "e" overflow menu is a logged future task. Gallery popup/carousel height made viewport-relative.

### Files changed
- `builder/server.js` — `renderCartridge()`, all 6 sites, `PORT` env.
- `builder/features/slides/slide-03-why-us.html` (new), `slide-02-company.html`, `slide-14-cta.html`, `slide-01-cover.html`.
- `builder/features/slides/style.css` — `pb-responsive` / `pb-chrome` model; gallery button.
- `builder/features/slides/components/gallery.js` — viewport-relative carousel height.
- `builder/features/builder-ui/preview.html` — TC per-line list editing; gallery button beside `f`.
- `builder/data/templates.json`, `slide-library.json` — template03 registry + `lib-why-us` + tier reshape.
- `architecture/slide-system-rulebook.md` (§3), `architecture/standardization-plan.md` (RESUME).
- `scripts/validate.js` — `responsive-model` WARN.

### Verification & follow-ups
- Validator clean on all rebuilt cartridges; render-checked via authenticated curl. Why Us responsive iterated live with the user (medium-screen clipping, header overlap, logo shrink, gallery-button-fixed).
- **Pending user visual checks:** Company across all tabs + carousel; Cover gallery button + chrome at 419×595 / 822×567.
- **Related task likely now closeable:** `Issue-M-2026-04-30-slides-css-responsive-layout-tablet-landscape-image-display.md` (the tablet-landscape clipping this model fixes).
- **Next:** rebuild loop #4 Products Overview (`tpl-new-capability-matrix`) — built `pb-responsive` from the start.
