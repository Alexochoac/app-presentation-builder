# Feature: 24-Variable CSS Theme System

**Priority:** High  
**Status:** Done  
**Date:** 2026-05-24  
**Last updated:** 2026-05-24

---

## Problem

Selecting a style in the Template Detail View barely changed the slide's appearance. Style reference files are full standalone HTML presentations — their CSS rules target their own class names (`.glass-card`, `.neon-text`) which don't exist in slide templates. Switching styles only changed the body background and barely anything else.

---

## Solution

A 24-variable CSS theme system:
- **Theme files** are plain `.css` files in `builder/themes/`, each containing a `:root {}` block with 24 standardized CSS variables
- **Slide templates** use `var(--name, fallback)` for every visual property
- **Bridge variables** in `style.css` map old names (`--bg-card`, `--border`) to new names so existing templates respond automatically
- Themes are **auto-generated** from the 35 style reference HTML files via `builder/generate-themes.js`
- Picking a theme fully transforms a slide: background, text, font, accent color, cards, hero overlay, badges, logo container

---

## The 24 CSS Variables

| Variable | Light example | Dark example | Used for |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0a0a0f` | Page / slide background |
| `--slide-hero-bg` | `#FFFFFF` | `#070B1A` | Hero section bg |
| `--slide-hero-rgb` | `255,255,255` | `7,11,26` | Bg as R,G,B (for rgba() overlays) |
| `--text` | `#1d1d1f` | `#ffffff` | Primary text |
| `--text-muted` | `rgba(0,0,0,.50)` | `rgba(255,255,255,.55)` | Secondary / caption text |
| `--accent` | `#0066cc` | `#6366f1` | Primary brand accent |
| `--accent-rgb` | `0,102,204` | `99,102,241` | Accent as R,G,B |
| `--accent-mid` | `#0066cc` | `#6366f1` | Accent variant (currently same) |
| `--accent-light` | `#73abe3` | `#a9abf7` | 45% tint of accent for gradients |
| `--font-body` | `'SF Pro Display', ...` | `'Inter', ...` | Body font |
| `--font-heading` | `'SF Pro Display', ...` | `'Inter', ...` | Heading font (can differ) |
| `--hero-overlay-angle` | `135deg` | `135deg` | Hero gradient direction |
| `--hero-overlay-start` | `.25` | `.72` | Hero overlay opacity at start |
| `--hero-overlay-end` | `.10` | `.38` | Hero overlay opacity at end |
| `--card-bg` | `rgba(0,0,0,.02)` | `rgba(255,255,255,.05)` | Card / panel background |
| `--card-border` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.10)` | Card border color |
| `--card-radius` | `12px` | `12px` | Card corner radius |
| `--card-shadow` | `0 2px 12px rgba(0,0,0,.08)` | `0 4px 20px rgba(0,0,0,.35)` | Card shadow |
| `--badge-bg` | `rgba(0,102,204,.15)` | `transparent` | Badge / chip background |
| `--badge-border` | `rgba(0,102,204,.35)` | `transparent` | Badge border |
| `--badge-radius` | `6px` | `4px` | Badge corner radius |
| `--badge-color` | `#0066cc` | `var(--accent)` | Badge text color |
| `--logo-bg` | `rgba(0,0,0,.04)` | `transparent` | Logo container background |
| `--logo-border` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.18)` | Logo container border |
| `--logo-radius` | `20px` | `20px` | Logo container corner radius |

---

## Bridge Variables

`style.css` maps the old variable names used by templates (from before the theme system) to the new 24-variable names. This means ALL templates respond to theme changes without per-template edits:

```css
--bg-card:       var(--card-bg);
--bg-card-hover: rgba(var(--accent-rgb), .06);
--border:        var(--card-border);
--border-hover:  rgba(var(--accent-rgb), .32);
--accent-light:  var(--accent);   /* default; themes override with 45% tint */
```

---

## CSS Cascade (template preview and deck-preview iframes)

```
1. <link href="/slides/style.css">   — base :root defaults (dark)
2. <style>[theme CSS]</style>        — theme overrides :root (from libSlide.styleCss)
3. <style>[deckAccentCss]</style>    — deck brand color overrides --accent only
```

**Priority rule:** Slide theme wins over deck-level CSS. Deck brand color (`colors.primary`) still overrides accent on top of everything.

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `builder/themes/*.css` (35 files) | Auto-generated theme CSS, one per style reference |
| `builder/generate-themes.js` | One-shot script: `node generate-themes.js` regenerates all 35 files |

### Modified files
| File | What changed |
|---|---|
| `builder/features/slides/style.css` | Added 13 new `:root` variable defaults; added bridge variables (`--bg-card: var(--card-bg)` etc.); `body { font-family: var(--font-body, ...) }` |
| `builder/features/slides/slide-01.html` | Uses all 24 vars with `var(--name, fallback)` everywhere; hardcoded white/rgba colors → `var(--text-muted)` |
| `builder/features/slides/slide-02-company.html` | `#E8711A` → `var(--accent)`, `rgba(232,113,26,*)` → `rgba(var(--accent-rgb),*)` |
| `builder/features/slides/slide-03-why.html` | Same accent color replacements |
| `builder/features/slides/slide-04-linescanner.html` | Same accent color replacements |
| `builder/features/slides/slide-05-technology.html` | Same accent color replacements |
| `builder/features/slides/slide-06-surface.html` | Same accent color replacements |
| `builder/features/slides/slide-11-sensitivity.html` | Same accent color replacements |
| `builder/features/slides/slide-14-cta.html` | Same accent color replacements (WhatsApp green kept) |
| `builder/features/slides/slide-23-screenprinting-v2.html` | Same accent color replacements |
| `builder/server.js` | See Server Changes section below |
| `builder/features/slides/index.html` | Template Detail View uses `allThemes`, `loadThemes()`, theme list sidebar, `themeId` on create |

### Templates unaffected (use shared classes from style.css)
Slides 08, 10, 13 use only shared classes (`.col-card`, `.int-card`, `.integration-grid`) that reference `--bg-card` and `--border`. These respond to theme changes automatically via the bridge variables — no per-template edits needed.

---

## Server Changes (`server.js`)

### New helpers
- `hexToLight(hex)` — computes a 45% white tint of a hex color (used for `--accent-light`)
- `hexToRgbStr(hex)` — already existed, unchanged

### New functions
- `generateThemeCss(html)` — extracts 24 variables from a style reference HTML file, returns a `:root {}` CSS block. Used by both `POST /api/themes/regenerate` and `generate-themes.js`.

### New endpoints
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/themes` | Required | List all theme files with `{ id, name, file, bgColor, accentColor }` |
| `POST /api/themes/regenerate` | Required | Regenerate all `.css` files from style references |
| `GET /themes/:file.css` | None (static) | Serve theme files to browser |

### Modified endpoints
| Endpoint | What changed |
|---|---|
| `GET /slides/template-preview/:id` | `?theme=x.css` injects the theme CSS; `?style=x.html` still works (legacy); "no theme" fallback sets all 24 new variable names |
| `POST /api/library` | Accepts `themeId`; reads theme `.css` and stores content as `styleCss` on the new slide |
| `GET /slides/library-preview/:id` | Now injects `libSlide.styleCss` into the page head |
| `GET /slides/library-edit/:id` | Now injects `libSlide.styleCss` into the page head |
| `GET /slides/deck-preview/:id` | **Priority flipped**: `libSlide.styleCss || deckConfig.styleCss` (slide theme wins) |
| `POST /api/deck/slides` (add to deck) | Only promotes slide's `styleRef` to deck level if it's a `.html` file (old system); `.css` theme files are per-slide and not promoted |

---

## Template Detail View Flow

1. User opens **Templates** tab → clicks **Use** on a template card
2. **Template Detail View** modal opens full-screen:
   - Left: live `<iframe>` preview of the template (`/slides/template-preview/:id`)
   - Right sidebar: ~35 theme rows (colored swatch + theme name), slide name input, Create button
3. Clicking a theme row sets `tplDetailThemeId` and reloads the iframe to `?theme=filename.css`
4. User types a slide name, clicks **Create Slide**
5. `POST /api/library` with `{ templateId, name, themeId: 'apple-minimal.css' }`
6. Server reads `themes/apple-minimal.css`, stores the CSS content as `styleCss` on the new library slide
7. User is taken to **My Library** tab — the new slide's preview shows the theme applied
8. When added to a deck, the theme is preserved (slide `styleCss` takes priority over deck `styleCss`)

---

## Theme Generation

Run once to regenerate all theme files after editing style references:

```bash
cd builder
node generate-themes.js
```

Output: `Done: 35 themes written to builder/themes/`

The generator (`generate-themes.js`) and the server's `generateThemeCss()` function are kept in sync. Both produce identical output. The generator is the standalone version; the server function is used for the `/api/themes/regenerate` endpoint.

---

## Bugs Fixed During Implementation

| Bug | Root Cause | Fix |
|---|---|---|
| Theme changes barely visible | `extractStyleCss` forced `bgColor = '#0a0a0f'` regardless of style; accent not extracted | Changed to `null` theme arg; added `:root` accent extraction to `buildThemeOverride` |
| Slides page crash after template detail view added | `openNewSlideModal` referenced removed `#newSlideStep2` and `newSlideStyleRef` | Removed dead references |
| Page crash (second) | `#newSlideName` input removed; Enter key listener targeting it | Updated to target `#tplDetailSlideNameInput` |
| Theme applied in preview but gone after create | `library-preview` and `library-edit` routes never injected `libSlide.styleCss` | Added `libSlide.styleCss ? '<style>...</style>' : ''` to both routes |
| Theme lost when slide added to deck | `effectiveStyleCss = deckConfig.styleCss || libSlide.styleCss` — deck wins | Flipped to `libSlide.styleCss || deckConfig.styleCss` — slide wins |
| Old templates not responding to themes | `--bg-card` / `--border` in templates vs `--card-bg` / `--card-border` in themes — never connected | Bridge variables in `style.css` |
| Fonts not changing | `body { font-family: [hardcoded] }` in `style.css`; `--font-body` never applied to body | Changed to `var(--font-body, ...)` |
| `.blue` gradient ugly on blue/indigo themes | `--accent-light: #FFD27F` (amber) never overridden by themes | Changed default to `var(--accent)`; themes now output derived `--accent-light` (45% tint) |
| White text invisible on light themes (slide-01) | `.ls01-credit`, `.ls01-cust-placeholder`, `.ls01-nav-hint` hardcoded as `rgba(255,255,255,*)` | Changed to `var(--text-muted, ...)` |
| `.css` theme promoted to deck `styleCss` on first add | `POST /api/deck/slides` had no check on `styleRef` file type | Added `.endsWith('.html')` guard |

---

## Backward Compatibility

- `buildThemeOverride` / `extractStyleCss` still work — deck-level `.html` style references continue to function
- `styleRef` / `styleCss` fields on decks continue to work (legacy slides without `themeId`)
- `?style=x.html` query still works on template preview (legacy)
- The old `--bg-card` / `--border` variable names still resolve correctly via bridge

---

## Known Limitations

- **Semantic colors** (slide-03 red/green problem columns, slide-14 WhatsApp green `#25d366`) are intentionally kept hardcoded — they carry meaning beyond brand accent
- **Component-level effects** (glassmorphism blur, neon glows, animated gradients from style references) do not transfer to slide templates because those effects target CSS classes that don't exist in the templates
- **Canvas-rendered slides** (zone-builder / layout engine) do not yet use the 24-variable system — they render via `renderLayoutToHtml()` which has its own styling
