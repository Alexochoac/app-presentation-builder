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
  - `carousel.js` — `.ls-carousel` declarative image carousel (add/delete/reorder/zoom/compare/autoplay)
  - `lightbox.js` — zoom/gallery lightbox, `data-zoom` + `data-zoom-group`, `+ Add Image` button
  - `tabs.js` — `.ls-tabs` declarative tab switcher (add/delete/rename tabs)
  - `list.js` — `ul[data-ls-list]` editable list (add/hide/delete/reorder/edit)
  - `table.js` — `table[data-ls-table]` capability matrix (rows + columns fully editable)
  - `tracker.js` — Umami analytics
- `.claude/settings.json` — Agent permission allow-list (Edit, Write, Bash)

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `[data-zoom-group]` on carousel wrapper → all images share a gallery
- `data-counter` on `.ls-carousel` → shows "1 / N" counter (bottom-right)
- `data-no-caption` on `.ls-carousel` → suppresses auto-caption overlay
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- `data-ls-list` on `<ul>` → list.js takes over
- `data-ls-table` on `<table>` → table.js takes over
- Carousel/list/table saves dispatch `slide-carousel-save` custom event
- Compare slides: `ls-compare` class + `ls-cmp-left`/`ls-cmp-right` img classes, `data-compare-mode="split|reveal"`

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 created with `data-edit` + `contenteditable` on all text
- [x] `carousel.js` — reusable carousel with add/delete/reorder/zoom/autoplay toggle/compare mode
- [x] `lightbox.js` — gallery lightbox, thumbnails, zoom sync, `+ Add Image` from lightbox
- [x] `tabs.js` — add/delete/rename tabs, each panel holds carousel
- [x] `list.js` — add/hide/delete/reorder/dblclick-edit, auto-save
- [x] `table.js` — row+col add/hide/delete/reorder/edit, dot cycling, auto-save
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom`
- [x] All tab-bearing slides (02, 04, 05, 10) migrated to `ls-tabs`
- [x] Slides 03, 05 lists migrated to `list.js`
- [x] Slide-04 tables migrated to `table.js`
- [x] Slide-05 vc-cards use `data-no-caption`, duplicate counters cleaned
- [x] Slide-06 fully migrated: 11 `ls-carousel` divs (one per defect), compare slides use standard `ls-compare`, ~200 lines of custom JS/CSS removed
- [x] Carousel compare mode: Split (50/50) + Reveal (draggable handle), per-side replace, editable labels
- [x] Lightbox zoom freeze bug fixed (MutationObserver → direct class removal)
- [x] `data-zoom-init` persistence bug fixed (DOM attr → JS property)
- [x] Carousel counter moved to bottom-right
- [x] `.claude/settings.json` created with agent permission allow-list

## Next Steps
- [x] Dashboard built — post-login home with deck manager + slide library panels
- [x] `deck.json` + `slide-library.json` as source of truth; deck API endpoints added
- [x] Full mobile responsiveness pass — all 14 slides fixed for iPhone 15
- [x] Full editability pass — all visible text across all 14 slides now has `data-edit` + `contenteditable`
- [x] `data-builder-only` added to all builder-only UI controls
- [ ] Slide-06 defect selector names — JS-generated, need static HTML or editable config approach
- [ ] Image caption editing UI (captions come from `img.alt`, no edit path yet)
- [ ] Test all slides end-to-end in browser after editability pass
- [ ] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only`
- [ ] `scripts/deploy.js` — push to GitHub Pages

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), custom per-slide components
- **Phase 4** — White-label, AI, CRM integrations

Last updated: 2026-04-05
