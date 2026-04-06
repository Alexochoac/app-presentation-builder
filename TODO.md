# TODO — Presentation Builder

## High Priority
- [ ] Per-slide inline CSS mobile audit — each slide's `<style>` block needs responsive layout review (15 slides)
- [ ] Delete old `dashboard.css` after confirming new `app-style.css` works in browser

## Dashboard & UI
- [ ] Presentation view — clean read-only mode (visible slides + hidden slides in CTA extras menu)
- [ ] Customer Settings — wire up fields to actual deck personalization

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
- [x] `table.js` — row+col add/hide/delete/reorder/edit, dot cycling, resizable first col, auto-save
- [x] All slides 01–14 created and migrated to component system
- [x] Dashboard built — post-login home, deck manager + slide library
- [x] `deck.json` + `slide-library.json` as source of truth
- [x] `GET/PUT /api/deck` and `GET /api/slide-library` endpoints
- [x] `POST /api/clone-slide` endpoint
- [x] `preview.html` fetches deck from API
- [x] Full editability pass — all visible text in all 14 slides
- [x] Dashboard slide library redesign: hides in-deck slides, clone flow, two-way preview
- [x] Scaled iframe thumbnail preview + lightbox zoom in dashboard
- [x] `builder/shared/app-style.css` — Apple Keynote dark/light theme system
- [x] GitHub repo created: `Alexochoac/app-presentation-builder`
- [x] Server-side slide preview shell (`GET /slides/preview/:id`)
- [x] Save handler bug fixed — all 3 handlers use correct filename from `SLIDES[current].file`
- [x] Mobile-first CSS conversion — all `max-width` → `min-width` across all files
- [x] `table.js` fully wired in slide-04 — restore chips, col labels, dot classes fixed
- [x] Settings page (`/settings`) — Theme (working) + 4 Coming Soon sections
- [x] Dashboard "Company Settings" → "Customer Settings" with customer-specific fields
- [x] `style.css` shared slide components: cards, kpi-row, two-col, split all stack on mobile
