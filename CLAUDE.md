# CLAUDE.md — App Presentation Builder

## What This Project Does
A Node.js builder app that assembles customizable HTML sales presentations
for Softsolution & LiteSentry products, targeted at glass industry customers.

## Tech Stack
- Node.js + Express (builder server)
- HTML / CSS / JavaScript (slides)
- No framework — plain JS, self-contained slide fragments

## Project Structure
- `builder/` — Express server + slide files + builder UI
  - `server.js` — serves slides, handles save/upload APIs
  - `public/preview.html` — the builder preview UI
  - `slides/` — individual slide HTML fragments (slide-01, slide-02, …)
  - `slides/style.css` — shared styles for all slides
  - `slides/uploads/` — uploaded customer images (gitignored)
- `slide-library/` — reference slides and image assets
  - `linescanner/Slide Images/` — product images
  - `linescanner/General Slide Images/` — general glass industry images

## Running the Builder
```
cd builder
node server.js
```
Then open: http://localhost:3000/preview.html

## Key Conventions
- Each slide is a self-contained HTML fragment (`<div class="slide ...">`)
- Slide prefix: `ls[NN]-` (ls01-, ls02-, …) — never reuse a prefix
- `data-edit="key"` on any element = editable in builder, saved to disk
- `data-builder-only=""` on any element = stripped when building customer output
- Slides are registered in `builder/public/preview.html` → `const SLIDES = [...]`
- All slide images served via `/slides/assets/` (from slide-library)
- Uploaded images served via `/slides/uploads/` (builder local only)
- Shared logos served via `/slides/shared/` (from docs/shared/assets — TODO: move here)

## Build Pipeline (planned)
- `node scripts/build.js --customer [name]` — assembles slides into customer HTML
- Customer configs in `customers/[name]/config.json`
- Output to `docs/[customer]/index.html` for GitHub Pages
