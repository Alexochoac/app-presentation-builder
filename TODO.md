# TODO — Presentation Builder

## Immediate (test + stabilize)
- [ ] Test all migrated slides in browser: carousels, zoom, save/reload, zoom-sync
- [ ] Migrate slide-10 `ls10-tabs` → new `ls-tabs` component
- [ ] Migrate slides 02 and 04 tab systems → `ls-tabs` component

## Component Standardization (Phase 1 priority)
- [ ] IMAGES: Every single image in any slide → use `.ls-carousel` (add/delete/reorder/zoom/autoplay)
- [ ] TABLES: Reorderable rows, inline-editable cells, add/delete rows, responsive
- [ ] LISTS: Reorderable items, editable, add/delete, responsive
- [ ] Image alt text editable in builder → rename file for Umami tracking

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Completed
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 with `data-edit` + `contenteditable`
- [x] `carousel.js` — reusable carousel component
- [x] `lightbox.js` — gallery lightbox with thumbnails + zoom sync
- [x] `tabs.js` — add/delete/rename tabs, each holds carousel
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom`
- [x] Carousel save bug fixed (outerHTML)
- [x] Lightbox → carousel position sync on close
