---
title: Themes — Presentation styles — Light/dark variant for every style
type: Feature
priority: M
status: pending
area: themes
---

## Goal

Every presentation style (Finish theme) should render in **both light and dark** — the
*same* style, two modes — so the deck Theme control (Light / Dark / Checkerboard, on the
slide "f" button) works regardless of which style is applied. Checkerboard would then
alternate a styled deck between the style's light and dark variants.

## Background — why it does NOT work today (2026-06-19)

The per-slide light/dark/checkerboard system added on branch `fix/deck-theme-light-dark`
works for **plain (un-styled) decks** only. The moment a presentation style is applied, the
deck is intentionally routed differently and the Theme control goes (mostly) dead:

1. **Per-slide theming is gated off for styled decks.** `effectiveSlideTheme()` in
   `builder/server.js` returns `null` when `deckConfig.styleRef` is set, so the cartridge gets
   **no `data-theme` attribute** → Checkerboard and per-slide override do nothing, and the
   `.slide[data-theme="…"]` token rules in `features/slides/style.css` never engage. (Verified:
   a slide in the terminal-code deck renders with no `data-theme`.)

2. **The Finish stylesheet is a fixed, hardcoded aesthetic.** Finish CSS is injected by
   `finishStyleTag(ref)` (`server.js` ~L733), scoped to `.slide`, and picked **purely by the
   style's filename — it ignores `deck.theme` entirely**. The files are hand-authored looks with
   hardcoded colors: e.g. `themes/finish/terminal-code.css` has **47 hardcoded colors, all
   `!important`** (cyan/green on black) and only 5 `var()` usages. Code cannot auto-flip these to
   light without destroying the look.

3. **The palette half already flips, but is overridden.** Toggling Light/Dark regenerates
   `deck.styleCss` via `buildThemeOverride(refHtml, theme)` (a `:root` palette override that
   *does* produce light/dark tokens — see `server.js` ~L557). But the Finish CSS re-declares
   colors on `.slide` with `!important`, so the `:root` flip is invisible.

**Net:** on a styled deck, Checkerboard/per-slide do nothing and Light/Dark only nudges an
overridden `:root` palette → no visible change.

## Current convention for "light variant"

A light variant exists today only as a **separate selectable style**, not as a mode of one
style. There are **31 finish styles** and only **1** has a light companion:
`apple-keynote-style` + `apple-keynote-style-light` (paired by the `-light` filename suffix, in
both `builder/style-references/*.html` and the generated `builder/themes/finish/*.css`).

## Approach

### Phase 1 — Wiring (code, ~1 session)
Make the deck's Light/Dark setting pick the style's light companion automatically, instead of
treating `-light` as a different style.

- Establish the pairing rule: a style `<base>` has light variant `<base>-light`.
- `finishStyleTag(ref)` (and the frozen-export head assembly, `server.js` ~L2270) become
  **theme-aware**: when `deck.theme === 'light'` and `<base>-light.css` exists, inject that;
  otherwise fall back to `<base>.css`.
- Apply the same theme-aware pick to the deck's `styleCss` regeneration on theme change
  (PUT `/api/decks/:id`, `server.js` ~L1762) so the `:root` palette is derived from the matching
  variant ref.
- Checkerboard on a styled deck: alternate slides between `<base>` and `<base>-light` (needs the
  per-slide injection to vary by position for styled decks too — today the Finish tag is deck-wide;
  this likely means injecting Finish per-cartridge, keyed off `effectiveSlideTheme`, instead of
  once in the page `<head>`).
- Drop/relax the `styleRef` guard in `effectiveSlideTheme()` only as far as needed to drive the
  variant choice — do NOT also stamp the generic `.slide[data-theme]` token rules onto styled
  slides (they would fight the Finish colors).
- Pilot on `apple-keynote-style` (the one existing pair) to prove the mechanism end-to-end:
  builder canvas, preview, thumbnails, and frozen export.

### Phase 2 — UX honesty (code, small — can ship with Phase 1)
When the applied style has **no** light variant yet, the "f" Theme control must not look dead:
show Light/Dark disabled (or hidden) with a note like "This style has no light variant yet."
(Avoids the original confusion where the control looked active but did nothing.)

### Phase 3 — Author light variants for the remaining styles (design, ongoing)
Hand-author the missing companion variant for each style — one new `style-references/<base>-light.html`
(+ regenerate via `node generate-themes.js`). This is per-style design work, not code. For each,
first decide the style's native mode, then author the opposite mode keeping the same structure
(layout, borders, radius, shadows, fonts) and only re-working the palette/ink.

**Per-style checklist** (✅ = has both modes):
- [x] apple-keynote-style  (has apple-keynote-style-light)
- [ ] animated-gradients
- [ ] apple-minimal
- [ ] art-deco-luxury
- [ ] black-neon-glow
- [ ] blue-background-modal
- [ ] brutalist
- [ ] cluely-3d-style
- [ ] cluely-style
- [ ] cyberpunk-neon
- [ ] dark-glowing-style
- [ ] dark-mode-pro
- [ ] editorial-magazine
- [ ] glassmorphism
- [ ] hand-drawn-sketch
- [ ] isometric-3d
- [ ] liquid-metal
- [ ] memphis-design
- [ ] minimalist-clean
- [ ] modern-modal-style
- [ ] modern-saas-dark
- [ ] modern-tech-startup
- [ ] neumorphism
- [ ] old-vide-game
- [ ] old-video-game2
- [ ] retro-synthwave
- [ ] simple-colors-style
- [ ] swiss-design
- [ ] terminal-code
- [ ] white-with-pops-of-color

## Key files
- `builder/server.js` — `finishStyleTag()` (~L733), `effectiveSlideTheme()` / `applyRootTheme()`,
  `buildThemeOverride()` (~L557), PUT `/api/decks/:id` styleCss regen (~L1762), frozen-export head
  (~L2270), `GET /api/deck` (returns `theme`/`checkerboard`/`deckId`).
- `builder/features/slides/style.css` — `.slide[data-theme="light|dark"]` token rules (plain-deck path).
- `builder/features/builder-ui/index.html` & `preview.html` — the "f" popover Theme control
  (`themeScopeSeg` / `themeDeckSeg` / `themeSlideSeg`).
- `builder/style-references/*.html` (style masters) → `builder/generate-themes.js` →
  `builder/themes/finish/*.css` (generated).

## Decision log
- 2026-06-19 — User: "Light/dark variants should work on every style — same style in light or
  dark." Confirmed this is the desired end state. Investigation showed it requires Phase 1 wiring
  + Phase 3 authoring (styles are bespoke hardcoded aesthetics, not palette-driven). Code held off;
  this task captures the plan.

## Related
- `Issue-M-2026-06-16-themes-gallery-overlay-not-adopting-finish-style.md` — same Finish-scoping
  reality (Finish CSS is `.slide`-scoped, re-declares ink on `.slide`).
- `idea-2026-04-20-css-design-system-eliminate-per-slide-style-blocks.md` — the longer-term
  palette-driven direction; if Finish themes were variable-driven, light/dark would flip for free
  and Phase 3 would shrink dramatically.
