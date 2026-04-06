# TODO — Presentation Builder

## Immediate (test + stabilize)
- [ ] Delete old `dashboard.css` after confirming new `app-style.css` works in browser
- [ ] Test dashboard in browser with new Apple Keynote style
- [ ] Test slide preview thumbnail and lightbox in dashboard
- [ ] Test clone slide flow end-to-end
- [ ] Test all slides end-to-end in builder

## Dashboard & UI
- [ ] Presentation view — clean read-only mode (visible slides + hidden slides in CTA extras menu)
- [ ] Settings page — theme toggle (dark/light) lives here

## Slides
- [ ] Slide-06 defect selector names — JS-generated, move to static HTML
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
- [x] Dashboard built — post-login home, deck manager + slide library
- [x] `deck.json` + `slide-library.json` as source of truth
- [x] `GET/PUT /api/deck` and `GET /api/slide-library` endpoints
- [x] `POST /api/clone-slide` endpoint
- [x] `preview.html` fetches deck from API
- [x] Full mobile responsiveness — all 14 slides fixed for iPhone 15
- [x] Full editability pass — all visible text in all 14 slides
- [x] Dashboard slide library redesign: hides in-deck slides, clone flow, two-way preview
- [x] Scaled iframe thumbnail preview + lightbox zoom in dashboard
- [x] `builder/shared/app-style.css` — Apple Keynote dark/light theme system
- [x] GitHub repo created: `Alexochoac/app-presentation-builder`
