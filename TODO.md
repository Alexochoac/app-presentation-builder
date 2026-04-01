# TODO — Presentation Builder

## Immediate (test + stabilize)
- [ ] Test all slides end-to-end: carousels, tabs, lists, tables, zoom, save/reload
- [ ] Image alt text editable in builder → rename file for Umami tracking

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Completed
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 with `data-edit` + `contenteditable`
- [x] `carousel.js` — reusable carousel (add/delete/reorder/zoom/autoplay)
- [x] `lightbox.js` — gallery lightbox with thumbnails + zoom sync
- [x] `tabs.js` — add/delete/rename tabs, each holds carousel
- [x] `list.js` — add/hide/delete/reorder/dblclick-edit, auto-save
- [x] `table.js` — row+col add/hide/delete/reorder/edit, dot cycling, auto-save
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom`
- [x] All tab-bearing slides (02, 04, 05, 10) migrated to `ls-tabs`
- [x] Slides 03 + 05 lists migrated to `list.js`
- [x] Slide-04 tables migrated to `table.js` (stripped 27 duplicate baked-in controls)
- [x] Slide-02 world map `data-zoom` added
- [x] Content padding fix (slides hidden behind nav bar)
- [x] Dark-mode scrollbars
- [x] Carousel save bug fixed (outerHTML)
- [x] Lightbox → carousel position sync on close
- [x] list.js + table.js registered in preview.html
