# Softsolution Slide Library — LineScanner

Reusable slide components for customer presentations. Each file is a self-contained
`<div class="slide ...">` block ready to drop into any presentation built on the
Softsolution CSS system.

## How to Use

1. **Create a new presentation** using the presentation-builder skill.
2. **Copy the base CSS** from `_base.css` into the new `<style>` tag.
3. **Copy a theme file** (e.g. `_theme-starglass.css`) and update the color variables
   to match the new customer's brand.
4. **Copy the slides you need** from the `linescanner/` folder and paste them into
   the `<div class="slides-container">` section.
5. **Update content** — replace logos, text, and image file names as needed.

## Folder Structure

```
slide-library/
├── README.md          ← this file
├── _base.css          ← all component CSS (uses CSS variables, no hardcoded colors)
├── _theme-starglass.css  ← Starglass blue theme (light + dark variables)
└── linescanner/
    ├── slide-01-cover.html         Hero slide — customer logo + tagline + bg image
    ├── slide-02-company.html       KPI cards — company stats
    ├── slide-03-why.html           Why LineScanner — feature cards + image split
    ├── slide-04-technology.html    16-bit technology — numbered steps + image
    ├── slide-05-surface.html       Surface quality — defect tags + scan images
    ├── slide-06-dimension.html     Dimensional control — two-column + screenshot
    ├── slide-07-serigrafia.html    Screen printing / logo check — tags + images
    ├── slide-08-database.html      Database / traceability — feature list + images
    ├── slide-09-integrations.html  Integration partners grid
    └── slide-10-cta.html           Next steps CTA box
```

## Image Paths

All slides reference images as `assets/{filename}`. When building for a new customer,
update image filenames to match what's in their `assets/` folder.

## Reference Presentations

- **Starglass Spain** (`softsolution-presentations/starglass-spain/`) — built from
  this library. Uses `_theme-starglass.css` colors.
