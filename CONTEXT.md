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
  - `carousel.js` — `.ls-carousel` declarative image carousel (add/delete/reorder/zoom)
  - `lightbox.js` — zoom/gallery lightbox, `data-zoom` + `data-zoom-group`
  - `tabs.js` — `.ls-tabs` declarative tab switcher (add/delete/rename tabs)
  - `list.js` — `ul[data-ls-list]` editable list (add/hide/delete/reorder/edit)
  - `table.js` — `table[data-ls-table]` capability matrix (rows + columns fully editable)
  - `tracker.js` — Umami analytics

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `[data-zoom-group]` on carousel wrapper → all images share a gallery
- `data-counter` on `.ls-carousel` → shows "1 / N" counter
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- `data-ls-list` on `<ul>` → list.js takes over
- `data-ls-table` on `<table>` → table.js takes over
- Carousel/list/table saves dispatch `slide-carousel-save` custom event

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 created with `data-edit` + `contenteditable` on all text
- [x] `carousel.js` component — replaces all per-slide carousel implementations
- [x] `lightbox.js` component — gallery mode with thumbnails, zoom sync
- [x] `tabs.js` component — add/delete/rename tabs, each panel holds carousel
- [x] `list.js` component — add/hide/delete/reorder/edit, auto-save
- [x] `table.js` component — row/col add/hide/delete/reorder/edit, dot cycling, auto-save
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom`
- [x] All tab-bearing slides (02, 04, 05, 10) migrated to `ls-tabs`
- [x] Slides 03, 05 lists migrated to `list.js`
- [x] Slide-04 tables migrated to `table.js` (baked-in duplicate controls stripped)
- [x] Slide-02 world map `data-zoom` added
- [x] Content padding fix (nav bar overlap)
- [x] Dark-mode scrollbars

## Next Steps
- [ ] Test all slides end-to-end in browser (carousels, tabs, lists, tables, zoom, save/reload)
- [ ] Image alt text editable in builder (renames file for Umami tracking consistency)
- [ ] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only`
- [ ] `scripts/deploy.js` — push to GitHub Pages

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), custom per-slide components
- **Phase 4** — White-label, AI, CRM integrations

Last updated: 2026-04-01
