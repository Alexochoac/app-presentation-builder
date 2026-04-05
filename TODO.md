# TODO — Presentation Builder

## Immediate (test + stabilize)
- [ ] Test all slides end-to-end in browser after editability pass
- [ ] Slide-06 defect selector names — JS-generated, need static HTML or editable config approach
- [ ] Image caption editing UI (captions come from `img.alt`, no edit path yet)

## Build & Deploy
- [ ] `scripts/build.js` — assemble customer HTML, strip `data-builder-only` elements
- [ ] `scripts/deploy.js` — push assembled output to GitHub Pages

## Completed
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] `carousel.js` — reusable carousel (add/delete/reorder/zoom/autoplay/compare)
- [x] `lightbox.js` — gallery lightbox with thumbnails + zoom sync + Add Image button
- [x] `tabs.js` — add/delete/rename tabs, each holds carousel
- [x] `list.js` — add/hide/delete/reorder/dblclick-edit, auto-save, self-healing restore area
- [x] `table.js` — row+col add/hide/delete/reorder/edit, dot cycling, auto-save
- [x] All slides 01–14 created and migrated to component system
- [x] Slide-06 migrated to 11 `ls-carousel` divs + standard compare mode
- [x] Carousel compare mode: Split + Reveal (draggable handle), per-side replace, editable labels
- [x] Dashboard built — post-login home, deck manager + slide library, company settings placeholder
- [x] `deck.json` + `slide-library.json` as source of truth for deck order/visibility
- [x] `GET/PUT /api/deck` and `GET /api/slide-library` endpoints
- [x] `preview.html` fetches deck from API (no more hardcoded SLIDES array)
- [x] Swipe gesture navigation in builder
- [x] Auth redirects fixed (post-login → dashboard)
- [x] Full mobile responsiveness — all 14 slides fixed for iPhone 15 (390px)
- [x] Full editability pass — all visible text in all 14 slides has `data-edit` + `contenteditable`
- [x] `data-builder-only` on all builder-only UI controls (slides 01, 03, 04, 05)
- [x] Broken edit bugs fixed: slide-02 headline, slide-03 JS error, slide-10 carousel keys, slide-14 email href
