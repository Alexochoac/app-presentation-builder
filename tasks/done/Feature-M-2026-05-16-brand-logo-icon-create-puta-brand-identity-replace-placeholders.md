---
title: Brand — Logo & Icon — Create PUT.A. brand identity and replace placeholders
type: Feature
priority: M
status: done
area: other
---

Created the PUT.A. Presentation App brand identity (icon + logo SVG) and wired it into the app by replacing all placeholder image references across templates, data files, and CSS.

## What was created

- `builder/shared/brand/icon.svg` — Creative square icon mark: giant "P" (solid white) + outlined "A" (bottom-right, outline-only for modern contrast) + periwinkle accent dot referencing the "." punctuation style. Indigo→violet gradient background.
- `builder/shared/brand/logo.svg` — Text-only horizontal lockup:
  - Line 1: **PUT.** (black, heavy weight)
  - Line 2: **A.** (black, heavy weight) + *Presentation* (gray #888888, light weight)

## Placeholder references replaced → `/shared/brand/logo.svg`

| File | Old value |
|---|---|
| `builder/server.js` | `/slides/shared/placeholder.png` |
| `builder/features/slides/slide-15-clone-of-integrations.html` | `/slides/shared/placeholder.png` |
| `builder/features/slides/slide-24-test-simple.html` | `/slides/shared/logo-placeholder.svg` |
| `builder/features/slides/slide-25-before-after.html` | `/slides/shared/logo-placeholder.svg` |
| `builder/features/slides/slide-26-cover.html` | `/slides/shared/logo-placeholder.svg` |
| `builder/data/templates.json` | `/slides/shared/logo-placeholder.svg` |
| `builder/data/slide-library.json` | `/slides/shared/logo-placeholder.svg` |
| `architecture/claude-skill-template-creator.md` | `logo-placeholder.svg` → `logo.svg` |

## CSS changes (`builder/features/slides/style.css`)

- Removed gray box from `.slide-logo-row`: stripped `background`, `backdrop-filter`, `border-radius`, `padding`
- Removed opacity reduction (`opacity: .90`, `opacity: .65`) so logo colors render true
- Made logo 2× bigger across all breakpoints:
  - Base: 28px → 56px
  - Mobile: 22px → 44px
  - Desktop: 30px → 60px

## URL routing

Logo served via existing `/shared/` static route — no new routes needed:
`/shared/brand/logo.svg` → `builder/shared/brand/logo.svg`

## Implementation Summary

**Context:** The app had no brand identity — templates and slides used generic placeholder images (`placeholder.png` and `logo-placeholder.svg`) served from `/slides/shared/`.

**What was built:**
- Designed two SVG brand assets from scratch in code: a creative icon mark and a text-only wordmark. The icon uses a large solid "P" dominating the left side with a smaller outline-only "A" in the bottom-right — a modern editorial contrast technique — plus a periwinkle accent dot referencing the "PUT.A." period punctuation style.
- The logo went through two design iterations: first indigo/violet colors, then switched to black (`#111111`) and gray (`#888888`) at user request.

**Root cause of templates not loading:** The initial grep only caught `placeholder.png`, but the actual placeholder used by templates was a different file: `logo-placeholder.svg`. Both had to be replaced across 8 files total.

**CSS fix:** The `.slide-logo-row` had a dark semi-transparent pill (`background: rgba(0,0,0,.32)` + `backdrop-filter: blur`) that acted as a gray box over the logo. This was removed entirely. Opacity overrides on `img` (`.90`) and `.slide-logo-ls` (`.65`) were also removed so the logo's own colors render at full fidelity. All height values were doubled across the three breakpoints (base, mobile, desktop).
