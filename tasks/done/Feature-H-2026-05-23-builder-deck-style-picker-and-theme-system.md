---
title: Feature — Builder — Deck Style Picker & Theme System
type: Feature
priority: H
status: superseded
area: builder
---

> **Superseded by** `Feature-H-2026-05-24-builder-theme-system-24var-css.md`  
> The deck-level style picker is still functional but the primary theme mechanism is now per-slide (24-variable system). The architecture notes below remain accurate for the legacy deck-style path.

## What This Is

A "Presentation Style" section was added to the Deck Settings drawer. Users can browse 35 style-reference HTML files (glassmorphism, cyberpunk, art-deco, brutalist, etc.), preview each one in a live iframe, and apply one to a deck. The applied style changes the deck's background color, font, and component look by overriding CSS custom properties.

---

## How It Works (Architecture)

### Two Data Stores

| Store | File | What It Contains |
|---|---|---|
| Deck config | `builder/data/decks.json` | Branding: `logo`, `heroBg`, `colors.primary`, `theme`, `styleRef`, `styleCss` |
| Deck content | `builder/data/decks/[id]/deck.json` | Slides list + visibility |

`getDeckConfig(id)` reads from `decks.json`. `readDeckById(id)` reads from `decks/[id]/deck.json`. These are separate — the style fields live only in `decks.json`.

### CSS Injection Chain

Three layers of CSS are injected in order (lowest to highest priority):

1. `<link href="/slides/style.css">` — base variable defaults
2. `styleCss` — theme override from the chosen style reference (`:root {}` variable block)
3. `accentCss` — deck primary color override (`--accent`, `--accent-rgb`, etc.)

In `deck-preview` iframes: injected as `<style>` tags in the HTML shell (`server.js` line ~76).
In `preview.html` (Open Builder): injected via JS into `document.head`, **scoped to `.slides-container`** so the builder's own UI chrome is not affected (see below).

### Style Extraction (`buildThemeOverride`)

When a user applies a style reference, the server reads the `.html` file, extracts its `<style>` block, and builds a `:root {}` CSS variable override (`extractStyleCss` → `buildThemeOverride`). This generated CSS is stored as `styleCss` in `decks.json`.

It extracts:
- `@import` lines (Google Fonts)
- Body background color (resolved through `var()` references)
- Body text color
- Body font-family
- Card background if a `.card` / `.feature-card` rule exists

And derives semantic tokens: `--bg`, `--slide-hero-bg`, `--slide-hero-rgb`, `--text`, `--text-muted`, `--bg-card`, `--bg-card-hover`, `--border`, `--border-hover`, `--nav-bg`, `--nav-border`, `--dot-inactive`, `--counter`.

### Theme Dark/Light

The deck has a `theme` field (`'dark'` or `'light'`). This is now passed to `buildThemeOverride`. If the deck is `dark` but the chosen style reference has a light background, the extractor forces `bgColor = '#0a0a0f'`. If `light` but style is dark, forces `bgColor = '#f5f5f7'`. When the user changes `theme` in deck settings, `styleCss` is automatically re-extracted if a `styleRef` is set.

### Hero Background Color

When `heroBgType === 'color'` and `heroBgColor` is set, `deckAccentCss` injects:
- `:root { --slide-hero-bg: [color]; --slide-hero-rgb: [r,g,b]; }`
- `img.hero-bg { display: none !important }`
- `.hero-overlay { display: none !important }`

This hides the hero image and shows only the solid color for ALL slide rendering paths (both canvas-rendered and template-file slides).

### CSS Scoping in preview.html

`scopeDeckCss()` rewrites all `:root {}` → `.slides-container {}` and `body {}` → `.slides-container {}` before injecting. This prevents deck CSS from leaking into the builder's own header, nav, and UI chrome.

---

## Files Modified

| File | What Changed |
|---|---|
| `builder/server.js` | Added static route `/style-references`, `GET /api/style-references`, `buildThemeOverride`, `extractStyleCss`, `resolveCssVar`, `getBodyProp`, `hexLuminance`, `isLight`, `hexToRgbStr`, `extractBgColor`. Extended `deckAccentCss` for hero bg color. Extended `PUT /api/decks/:id` for `styleRef` + theme re-extraction. Added `styleCss` to `GET /api/deck` response. |
| `builder/features/builder-ui/index.html` | Added "Presentation Style" section to Deck Settings drawer, `#stylePickerModal` HTML, CSS, and `initStylePickerModal()` JS. |
| `builder/features/builder-ui/preview.html` | Added `scopeDeckCss()` + injects `deck.styleCss` and `deck.accentCss` scoped to `.slides-container`. |
| `builder/features/slides/style.css` | Added `--slide-hero-bg` + `--slide-hero-rgb` to `:root`. Changed `.slide.hero` background, `.hero-overlay` to use variables. Changed `--bg-card-hover`, `--border-hover`, `--orb-a`, `--orb-b` to use `rgba(var(--accent-rgb), N)`. Hero h1/h2/click-hint colors to use `var(--text)`/`var(--text-muted)`. Logo separator to `var(--border)`. |
| `builder/data/decks.json` | Added `styleRef` and `styleCss` fields per deck (new optional fields). |
| `architecture/template-anatomy.md` | Updated Style-Ready section with full variable contract and hard rules (no hardcoded rgba, no hardcoded font-family, use `rgba(var(--accent-rgb), N)`). |
| `architecture/claude-skill-template-creator.md` | Same rules added to the template creator skill. |

---

## Known Issues / Needs Re-Checking

The feature was built across two sessions and has had multiple iterations. The user reported it is **still not working correctly**. The following should be verified end-to-end:

### 1. Style Picker UI
- [ ] Deck Settings drawer shows "Presentation Style" section with current style name (or "Default")
- [ ] "Browse Styles" button opens the style picker modal
- [ ] Card list loads all style references with colored swatches
- [ ] Clicking a card loads the style's HTML in the right-hand iframe
- [ ] "Apply This Style" saves the selection and updates the drawer label
- [ ] After apply, the main canvas iframe reloads with the new style
- [ ] After apply, all thumbnail iframes reload
- [ ] "Default" card clears the style

### 2. Builder Preview (deck-preview iframes)
- [ ] Changing the style reference changes the background color of slides
- [ ] Changing the style reference changes the font (if style uses a Google Font)
- [ ] Dark style on a dark-theme deck → dark slide backgrounds
- [ ] Light style on a light-theme deck → light slide backgrounds
- [ ] Light style on a dark-theme deck → should be overridden to dark
- [ ] Dark style on a light-theme deck → should be overridden to light

### 3. Open Builder (preview.html)
- [ ] Opening "Open Builder" reflects the same style as the builder preview
- [ ] Builder header/nav colors are NOT affected (no bleed from deck CSS)
- [ ] `deck.styleCss` is non-null in the API response (`GET /api/deck` now returns it at top level)

### 4. Primary Color
- [ ] Card hover backgrounds change when primary color changes (uses `rgba(var(--accent-rgb), .06)`)
- [ ] Glowing orbs change when primary color changes
- [ ] Border hover color changes

### 5. Hero Background Color
- [ ] Setting `heroBgType = 'color'` and a `heroBgColor` hides the hero image
- [ ] The selected color is visible on the hero slide
- [ ] No placeholder/broken image shows

### 6. Theme Dark/Light Toggle
- [ ] Switching deck theme from dark → light re-extracts `styleCss` if a style is applied
- [ ] The re-extracted CSS uses light-mode variables
- [ ] Switching back to dark re-extracts with dark variables

---

## Root Causes Found & Fixed (history)

| Bug | Root Cause | Fix |
|---|---|---|
| Open Builder not showing styles | `readDeckById` reads content-only deck.json, not decks.json where `styleCss` lives. `/api/deck` never exposed `styleCss`. | Added `styleCss: getDeckConfig(activeDeckId).styleCss` to the `/api/deck` response. |
| CSS leaking into builder header | `styleCss`/`accentCss` injected as `:root {}` affecting the entire `preview.html` document. | `scopeDeckCss()` rewrites `:root {}` → `.slides-container {}` before injection. |
| `var(--black)` not resolved | Style refs define `--black: #000` in their own `:root` and use `body { background: var(--black) }`. Stored literally. | `resolveCssVar()` walks the style ref's own `:root` up to depth 4 to resolve. |
| Theme setting ignored | `deck.theme` was saved but never used in CSS extraction. | `buildThemeOverride` accepts `deckTheme` param; forces dark/light bg defaults if mismatch. |
| Primary color not applied everywhere | `--bg-card-hover`, `--border-hover`, `--orb-a`, `--orb-b` used hardcoded orange hex. | Changed to `rgba(var(--accent-rgb), N)` in style.css. |
| Hero bg color not visible | `deckAccentCss` didn't handle `heroBgType === 'color'`. | Added CSS injection for `--slide-hero-bg` + img/overlay hiding. |
| Apply not updating slides | `applyStyle()` was fire-and-forget, didn't wait for save promise. | Chained `.then()` to call `reloadSlideFrame()` and reload thumbnails after save. |

---

## What "Fully Working" Looks Like

When the user selects a style reference and applies it:
1. The slide backgrounds change to the style's background color
2. The typography (font family, text color) changes to the style's font
3. Card hover effects use the deck's primary color (not hardcoded orange)
4. The hero slide background changes (either via CSS var or heroBgColor injection)
5. The change is visible in both the builder canvas (deck-preview iframes) and Open Builder (preview.html)
6. The builder's own UI (header, deck list, buttons) looks completely unchanged

Styles are not expected to change component-level visual effects (glassmorphism blur, neon borders, animated gradients) because those target CSS classes that don't exist in our slide templates. The theme system changes colors and typography only.
