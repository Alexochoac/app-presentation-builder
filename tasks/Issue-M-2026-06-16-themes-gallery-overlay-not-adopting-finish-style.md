---
title: Themes — Gallery overlay does not adopt the active theme (Finish + ink)
type: Issue
priority: M
status: pending
area: themes
---

## Goal

When a deck uses a theme, the **Gallery** overlay (opened by the "Gallery" button) should look like
the rest of that theme — same signature surfaces, same ink/contrast — instead of falling back to the
generic dark palette.

## The Problem

The gallery overlay lives **outside the themed scope**, so the Finish block never reaches it:

1. **It must be a sibling of the slide.** `features/slides/components/gallery.js` creates
   `.ls-gallery-overlay` as a sibling of the `[data-slide]` root (see its header comment), because the
   overlay is `position: fixed` and `.slide` carries `transform: scale(...)` — a transformed ancestor
   breaks `position: fixed`. So the overlay cannot live inside `.slide`.

2. **The theme's real styling is `.slide`-scoped.** Injection happens in `server.js` (~L100-102):
   - Palette half → `:root` (global). The gallery *does* read these (`var(--accent)`, `var(--text)`,
     `var(--bg-card)`, `var(--border)`, …).
   - Finish half → `<style data-finish>` scoping everything to `.slide …` and targeting skeleton classes
     (`.card`, `.kpi-card`, …). The gallery is neither inside `.slide` nor uses those classes, so **none
     of the signature look reaches it**.

3. **Ink mismatch.** Several Finish blocks re-declare `--text` / `--text-muted` / `--accent` **on
   `.slide`**, not `:root` (e.g. neumorphism: the palette ships a *dark* identity and the Finish flips it
   to dark-text-on-light only on `.slide`). The gallery, reading `:root`, gets the **un-flipped** values
   → it can render mis-contrasted (e.g. white text on a light surface), not merely unstyled.

Net: the gallery always shows the generic `:root` palette and can be mis-inked on themes whose Finish
flips the field ink.

## Affected files

- `builder/features/slides/components/gallery.js` — injects `<style id="ls-gallery-styles">`; classes
  `.ls-gallery-overlay/-popup/-wrap/-slide/-nav/-thumb/-add/…` (all driven off theme vars already).
- `builder/features/slides/style.css` — `.slide { transform: scale() }` (why fixed-children can't nest);
  field-ink model.
- `builder/themes/finish/*.css` — Finish blocks scope to `.slide` + skeleton classes only.
- `builder/server.js` (~L100-102, `finishStyleTag`) — palette → `:root`, Finish → `.slide`.

## Direction (not prescriptive)

Pick during the per-theme detail pass:
- **Share the field ink with the overlay** — set `--text`/`--text-muted`/`--accent` at a scope the overlay
  also inherits (e.g. a deck/theme wrapper class on `<body>` or the slides container), not only on
  `.slide`. Fixes contrast cheaply and globally.
- **Skin the gallery in the Finish** — have each Finish also target the `.ls-gallery-*` surfaces so the
  overlay gets the signature look (per-theme work; do it alongside each theme's detail pass).
- Consider tagging the overlay with the active `data-finish`/theme name when created, so a single
  `[data-finish="x"] .ls-gallery-popup { … }` convention can carry the look without the `.slide` scope.

## Acceptance Criteria
- [ ] Gallery overlay text/ink contrasts its surface on **every** theme (esp. light themes whose Finish
      flips `--text` on `.slide` — neumorphism, apple-minimal, editorial-magazine, swiss-design, etc.)
- [ ] Gallery surfaces (popup, wrap, thumbs, nav, add buttons) visibly reflect the active theme's
      signature look, not the generic dark palette
- [ ] No regression to the gallery on the default (un-themed) dark base
- [ ] Approach documented in `architecture/standardization-plan.md` (Finish-block recipe) so future
      themes cover the gallery

## Notes
Surfaced 2026-06-16 during the Finish-block standardization (§5). Same root shape may affect any other
fixed-position, slide-sibling overlay — e.g. the image **lightbox** (`#lightbox` in `style.css`), which
hardcodes `#F5A623`/white rather than theme vars. Worth checking in the same pass.
