# Presentation Builder — Project Context

## What This Is
A local Express app for building and publishing customizable HTML slide presentations.
Sales teams use it to build customer-specific decks, then publish to GitHub Pages.

## Current Phase
**Phase 1** — Local app, single user, single company. Login portal + builder UI + publish to GitHub Pages.

## Architecture
- `builder/server.js` — Express server, save/upload APIs
- `builder/features/builder-ui/preview.html` — Builder UI (slide editor)
- `builder/features/slides/slide-NN-*.html` — Self-contained slide fragments
- `builder/features/slides/style.css` — Shared CSS for all slides
- `builder/features/slides/components/` — Reusable JS components:
  - `carousel.js` — `.ls-carousel` declarative image carousel
  - `lightbox.js` — zoom/gallery lightbox, `data-zoom` + `data-zoom-group`
  - `tabs.js` — `.ls-tabs` declarative tab switcher (new)
  - `tracker.js` — Umami analytics

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `[data-zoom-group]` on carousel wrapper → all images share a gallery
- `data-counter` on `.ls-carousel` → shows "1 / N" counter
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- Carousel save dispatches `slide-carousel-save` custom event

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 created with `data-edit` + `contenteditable` on all text
- [x] `carousel.js` component — replaces all per-slide carousel implementations
- [x] `lightbox.js` component — gallery mode with thumbnails, zoom sync
- [x] `tabs.js` component — add/delete/rename tabs, each panel holds carousel
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom` (removed ~200–300 lines of per-slide CSS+JS each)
- [x] Carousel save bug fixed (outerHTML vs innerHTML)
- [x] Lightbox → carousel zoom-sync on close

## Next Steps
- [ ] Test all migrated slides in browser (carousels, zoom, save/reload)
- [ ] Migrate slide-10 `ls10-tabs` to new `ls-tabs` component
- [ ] Migrate slides 02 and 04 tab systems to `ls-tabs` component
- [ ] IMAGES: Every image component (including single images) should use `.ls-carousel` — add/delete/reorder/zoom/autoplay
- [ ] TABLES: All tables — reorderable rows, inline-editable cells, add/delete rows, responsive
- [ ] LISTS: All lists — reorderable, editable, add/delete items, responsive
- [ ] Image alt text editable in builder (renames file for Umami tracking consistency)
- [ ] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only`
- [ ] `scripts/deploy.js` — push to GitHub Pages

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), custom per-slide components
- **Phase 4** — White-label, AI, CRM integrations

Last updated: 2026-03-30
