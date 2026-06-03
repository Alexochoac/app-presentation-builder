---
title: Architecture — Theme System — Document Two-Block Style Render Paths
type: Feature
priority: L
status: done
completed_at: 2026-06-02 17:30
area: css
---

The two-block theme model (palette `styleCss` + finish block CSS from `themes/finish/`) was silently missing from two render paths: `preview.html` (Open Builder) only applied `styleCss` and `accentCss` but not the finish block, and `buildFrozenPresentation` was missing both `styleCss` and the finish block entirely. Both were fixed on 2026-06-02.

Document this rule in `architecture/slide-system-rulebook.md`: every render path that displays a deck slide — `deck-preview`, `preview.html`, and `buildFrozenPresentation` — must apply all three CSS layers in order: (1) `styleCss` palette, (2) finish block via `finishStyleTag(styleRef)`, (3) `accentCss`. Add a checklist or table so future render paths don't miss a layer.

## Implementation Summary

**Problem:** The Glassmorphism theme (and any theme with a finish block) looked visually wrong in two places — the Open Builder (`preview.html`) and finished/frozen presentations — while the builder canvas (`deck-preview` iframe) showed it correctly.

**Root cause:** The theme system uses two CSS blocks per style:
1. `styleCss` — the palette (CSS custom property variables)
2. Finish block CSS (`themes/finish/<name>.css`) — visual effects that can't be expressed as variables (animated gradient background, frosted glass blur, glow)

The `deck-preview` server route injected all three layers correctly. The other two render paths were incomplete:

- **`preview.html`** — applied `styleCss` and `accentCss` from `/api/deck` but never fetched or applied the finish block CSS.
- **`buildFrozenPresentation`** — included `slidesCss` (base) and `accentCss` but was missing `styleCss` (palette) entirely, plus the finish block.

**Files changed:**

- `builder/server.js` — `/api/deck` GET handler: added `finishCss` field to the response, reading from `themes/finish/<styleRef>.css` based on the deck's `styleRef`. Also fixed `buildFrozenPresentation`: added `presDeck.styleCss` and `finishStyleTag(presDeck.styleRef)` to the frozen HTML's `<head>`.
- `builder/features/builder-ui/preview.html` — added handling for `deck.finishCss` from the API response, injecting it as a `<style>` tag after `accentCss`. Also removed the Umami `script.js` loader and `trackEnter`/`trackExit` calls — analytics should only fire in finished presentations, not the builder.
