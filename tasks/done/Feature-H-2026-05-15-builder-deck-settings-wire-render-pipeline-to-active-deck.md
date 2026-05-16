---
title: Builder — Deck Settings — Render Pipeline — Wire to active deck
type: Feature
priority: H
status: done
area: builder
---

All deck settings (logo, heroBg, heroBgFocal, colors.primary, theme) are saved correctly to disk per deck in `builder/data/decks.json`, but the render pipeline ignores them. `renderHeroLayout()` in `server.js` calls `readSettings()` which reads from the global `builder/data/settings.json` instead of the active deck. Additionally, `colors.primary` and `theme` are never read or applied anywhere in the preview or build output.

Fix: update `renderHeroLayout()` and any related functions to pull logo, heroBg, heroBgFocal, and focal grid from the active deck object. Inject `colors.primary` as a CSS variable and apply the deck's `theme` (dark/light) when rendering slide previews and baking finished presentations.

## Completed

- Added `getDeckConfig(deckId)` — reads branding from `decks.json` (not the slide list from `deck.json`)
- Added `deckAccentCss(deck)` — injects `:root{--accent; --accent-mid; --accent-light; --accent-rgb}` derived from `colors.primary`
- Added `injectDeckBranding(html, deck)` — cheerio post-process for file-based slides, patches `img.hero-bg` src/focal/fit
- Added `hexToRgb()`, color derivation for `--accent-mid` (darker) and `--accent-light` (lighter)
- Fixed `renderHeroLayout()` to use deck logo, heroBg, heroBgFocal, heroBgFit
- Fixed `buildFrozenPresentation` to use per-deck branding and inject accent CSS
- Added Fill/Fit toggle per deck (`heroBgFit: cover|contain`) in drawer and server
- Fixed `.brand-badge` in `style.css` — was hardcoded blue, now uses `--accent-rgb` CSS variable
- Removed destructive `filter: brightness(0) invert(1)` from `.slide-logo-row img` — replaced with frosted glass backdrop so JPEG logos are visible
- Removed `.slide.hero .blue` override that was hardcoding purple gradient in the hero, overriding the CSS variable
- Added Company Logo section to `/settings` page with upload/remove UI wired to `/api/settings/logos`
