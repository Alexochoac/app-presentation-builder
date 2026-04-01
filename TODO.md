# TODO — Presentation Builder

## Immediate (test + stabilize)
- [ ] Audit slides 07–14 for standalone `<img>` tags needing `ls-carousel` conversion
- [ ] Test slide-06 compare slides (Split/Reveal) in browser
- [ ] Test all slides end-to-end: carousels, tabs, lists, tables, zoom, save/reload
- [ ] Image alt text editable in builder → rename file for Umami tracking

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Completed
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–14 with `data-edit` + `contenteditable`
- [x] `carousel.js` — reusable carousel (add/delete/reorder/zoom/autoplay/compare)
- [x] `lightbox.js` — gallery lightbox with thumbnails + zoom sync + Add Image button
- [x] `tabs.js` — add/delete/rename tabs, each holds carousel
- [x] `list.js` — add/hide/delete/reorder/dblclick-edit, auto-save
- [x] `table.js` — row+col add/hide/delete/reorder/edit, dot cycling, auto-save
- [x] All slides 04–12 migrated to `.ls-carousel` + `data-zoom`
- [x] All tab-bearing slides (02, 04, 05, 10) migrated to `ls-tabs`
- [x] Slides 03 + 05 lists migrated to `list.js`
- [x] Slide-04 tables migrated to `table.js`
- [x] Slide-05 vc-cards: `data-no-caption` added, duplicate counters cleaned
- [x] Slide-06 migrated to 11 `ls-carousel` divs + standard compare mode (~200 lines custom JS/CSS removed)
- [x] Carousel compare mode: Split + Reveal (draggable handle), per-side replace, editable labels
- [x] Lightbox zoom freeze bug fixed
- [x] `data-zoom-init` persistence bug fixed
- [x] Carousel counter → bottom-right
- [x] Slide-04 proc table "Add row" button fixed
- [x] `.claude/settings.json` agent permission allow-list created
- [x] Content padding fix (nav bar overlap)
- [x] Dark-mode scrollbars
